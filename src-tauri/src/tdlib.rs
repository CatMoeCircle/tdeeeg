use crate::chat_store::ChatStore;
use crate::download_store::{DownloadItem, DownloadStore};
use libloading::{Library, Symbol};
use serde_json::json;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_void};
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::ptr;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tokio::sync::oneshot;

// --- 辅助函数：递归重命名 JSON 键 ---
fn rename_json_key(value: &mut serde_json::Value, old_key: &str, new_key: &str) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(v) = map.remove(old_key) {
                map.insert(new_key.to_string(), v);
            }
            for (_, v) in map.iter_mut() {
                rename_json_key(v, old_key, new_key);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                rename_json_key(v, old_key, new_key);
            }
        }
        _ => {}
    }
}

// --- 配置结构体 ---
pub struct TdLibConfig {
    pub api_id: i32,
    pub api_hash: String,
    pub use_test_dc: bool,
}

// --- 定义 TDLib 函数签名 ---
type TdJsonClientCreate = unsafe extern "C" fn() -> *mut c_void;
type TdJsonClientSend = unsafe extern "C" fn(client: *mut c_void, request: *const c_char);
type TdJsonClientReceive =
    unsafe extern "C" fn(client: *mut c_void, timeout: c_double) -> *const c_char;
type TdJsonClientExecute =
    unsafe extern "C" fn(client: *mut c_void, request: *const c_char) -> *const c_char;

// --- 包装结构体 ---
pub struct TdLibWrapper {
    _lib: Library, // 保持 Library 存活
    client: *mut c_void,
    send_fn: TdJsonClientSend,
    _receive_fn: TdJsonClientReceive, // 标记为未使用，因为我们在后台线程中使用函数指针副本
    _execute_fn: TdJsonClientExecute,
}

// TDLib 的 client 是线程安全的
unsafe impl Send for TdLibWrapper {}
unsafe impl Sync for TdLibWrapper {}

pub struct AppState {
    pub tdlib: Mutex<Option<TdLibWrapper>>,
    pub pending_requests: Arc<Mutex<HashMap<i64, oneshot::Sender<serde_json::Value>>>>,
    pub request_id_counter: AtomicI64,
    pub config: Arc<Mutex<TdLibConfig>>,
    pub chat_store: Arc<Mutex<ChatStore>>,
    pub download_store: Arc<Mutex<DownloadStore>>,
    /// 每个 TDLib file_id 的流式互斥锁（用于串行化同一文件的并发 range 下载，
    /// 但不同文件可并行流式传输，避免全局锁把视频流请求全部串行化）
    pub stream_locks: Mutex<HashMap<i32, Arc<Mutex<()>>>>,
    pub connection_state: Arc<Mutex<Option<String>>>,
    pub options: Arc<Mutex<HashMap<String, String>>>,
}

impl AppState {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        Self {
            tdlib: Mutex::new(None),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            request_id_counter: AtomicI64::new(1),
            config: Arc::new(Mutex::new(TdLibConfig {
                api_id: env!("TG_API_ID")
                    .parse()
                    .expect("TG_API_ID must be a number"),
                api_hash: env!("TG_API_HASH").to_string(),
                use_test_dc: false,
            })),
            chat_store: Arc::new(Mutex::new(ChatStore::new())),
            download_store: Arc::new(Mutex::new(DownloadStore::new(data_dir))),
            stream_locks: Mutex::new(HashMap::new()),
            connection_state: Arc::new(Mutex::new(None)),
            options: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// --- TDLib 自定义启动参数---
#[tauri::command]
pub fn set_tdlib_parameters(
    state: State<AppState>,
    api_id: Option<i32>,
    api_hash: Option<String>,
    use_test_dc: Option<bool>,
) -> Result<(), String> {
    // 验证参数组合：要么修改 use_test_dc，要么 api_id 和 api_hash 都修改，要么 3 个同时改
    let has_creds = api_id.is_some() && api_hash.is_some();
    let has_test_dc = use_test_dc.is_some();

    // 检查是否只提供了 api_id 或 api_hash 其中之一
    if api_id.is_some() != api_hash.is_some() {
        return Err("api_id and api_hash must be provided together".to_string());
    }

    // 检查是否什么都没提供
    if !has_creds && !has_test_dc {
        return Err("No parameters provided to update".to_string());
    }

    let mut config = state.config.lock().map_err(|e| e.to_string())?;

    if let Some(test_dc) = use_test_dc {
        config.use_test_dc = test_dc;
    }

    if let (Some(id), Some(hash)) = (api_id, api_hash) {
        if id <= 0 {
            return Err("Invalid api_id: must be greater than 0".to_string());
        }
        if hash.trim().is_empty() {
            return Err("Invalid api_hash: cannot be empty".to_string());
        }
        config.api_id = id;
        config.api_hash = hash;
    }
    Ok(())
}

// --- 初始化 TDLib ---
#[tauri::command]
pub fn init_tdlib(app_handle: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut tdlib_guard = state.tdlib.lock().map_err(|e| e.to_string())?;

    if tdlib_guard.is_some() {
        return Ok(());
    }

    println!("Initializing TDLib...");

    // 1. 加载 DLL
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Cannot get exe directory")?;

    let possible_paths = vec![
        exe_dir.join("tdjson.dll"),
        exe_dir.join("bin").join("tdjson.dll"),
    ];

    let mut dll_path = possible_paths[0].clone();
    let mut found = false;

    for path in &possible_paths {
        let _ = app_handle.emit("tdlib-log", format!("Checking DLL at: {:?}", path));
        if path.exists() {
            dll_path = path.clone();
            found = true;
            break;
        }
    }

    println!("Loading DLL from: {:?}", dll_path);
    let _ = app_handle.emit("tdlib-log", format!("Loading DLL from: {:?}", dll_path));

    if !found {
        let err_msg = format!(
            "tdjson.dll not found. Checked paths: {:?}. Please ensure the TDLib dynamic library is placed correctly.",
            possible_paths
        );
        let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
        return Err(err_msg);
    }

    // 如果 DLL 在 bin/ 子目录中，将其加入 Windows DLL 搜索路径以加载其依赖
    #[cfg(windows)]
    if let Some(parent) = dll_path.parent() {
        if parent != exe_dir {
            let _ = app_handle.emit(
                "tdlib-log",
                format!("Adding DLL directory to search path: {:?}", parent),
            );
            // 将 DLL 所在目录路径转换为 UTF-16
            let wide: Vec<u16> = parent
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            extern "system" {
                fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
            }
            unsafe {
                SetDllDirectoryW(wide.as_ptr());
            }
        }
    }

    let lib = unsafe {
        Library::new(&dll_path).map_err(|e| {
            let err_msg = format!("Failed to load {}: {}", dll_path.display(), e);
            let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
            err_msg
        })?
    };
    let _ = app_handle.emit("tdlib-log", "DLL loaded successfully");
    // 2. 获取函数符号

    let client_create: Symbol<TdJsonClientCreate> = unsafe {
        lib.get(b"td_json_client_create")
            .map_err(|e| e.to_string())?
    };
    let client_send: Symbol<TdJsonClientSend> =
        unsafe { lib.get(b"td_json_client_send").map_err(|e| e.to_string())? };
    let client_receive: Symbol<TdJsonClientReceive> = unsafe {
        lib.get(b"td_json_client_receive")
            .map_err(|e| e.to_string())?
    };
    let client_execute: Symbol<TdJsonClientExecute> = unsafe {
        lib.get(b"td_json_client_execute")
            .map_err(|e| e.to_string())?
    };
    // 解引用 Symbol 获取原始函数指针
    let create_fn = *client_create;
    let send_fn = *client_send;
    let receive_fn = *client_receive;
    let execute_fn = *client_execute;

    // 设置日志等级
    let log_config =
        CString::new(r#"{"@type": "setLogVerbosityLevel", "new_verbosity_level": 1}"#).unwrap();
    unsafe { execute_fn(ptr::null_mut(), log_config.as_ptr()) };

    // 注册 TDLib 数据目录到 asset protocol 作用域，使前端能加载图片等文件
    let tdlib_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("TDLib");
    // 确保数据子目录存在
    std::fs::create_dir_all(tdlib_data_dir.join("tdlib_db"))
        .map_err(|e| format!("Failed to create TDLib db directory: {}", e))?;
    std::fs::create_dir_all(tdlib_data_dir.join("tdlib_files"))
        .map_err(|e| format!("Failed to create TDLib files directory: {}", e))?;
    let _ = app_handle
        .asset_protocol_scope()
        .allow_directory(tdlib_data_dir.clone(), true);

    // 3. 创建客户端
    println!("About to create TDLib client...");
    let client = unsafe { create_fn() };
    if client.is_null() {
        let err_msg =
            "Failed to create TDLib client: td_json_client_create returned null".to_string();
        let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
        return Err(err_msg);
    }
    println!("TDLib Client created.");

    // 启动后台接收线程
    let client_ptr = client as usize; // 传递 raw pointer 到线程
    let app_handle_clone = app_handle.clone();
    let pending_requests = state.pending_requests.clone();
    let config_clone = state.config.clone();
    let chat_store = state.chat_store.clone();
    let download_store = state.download_store.clone();
    let tdlib_db_dir = tdlib_data_dir.join("tdlib_db");
    let tdlib_files_dir = tdlib_data_dir.join("tdlib_files");
    let connection_state = state.connection_state.clone();
    let options = state.options.clone();
    std::thread::spawn(move || {
        let client = client_ptr as *mut c_void;
        loop {
            unsafe {
                let res_ptr = receive_fn(client, 1.0); // 1秒超时
                if !res_ptr.is_null() {
                    let c_str = CStr::from_ptr(res_ptr);
                    let json_str = c_str.to_string_lossy().into_owned();

                    // 尝试解析 JSON 以检查是否需要自动处理
                    if let Ok(mut event) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        // 打印收到的 update（调试）
                        if let Some(t) = event.get("@type").and_then(|v| v.as_str()) {
                            println!("[tdlib-update] {}", t);
                        } else {
                            println!("[tdlib-update] (no @type) {}", json_str);
                        }
                        // 检查是否有 @extra.request_id
                        let mut request_id = None;
                        if let Some(extra) = event.get("@extra") {
                            if let Some(id) = extra.get("request_id") {
                                if let Some(id_i64) = id.as_i64() {
                                    request_id = Some(id_i64);
                                } else if id.as_str() == Some("internal-setTdlibParameters") {
                                    if let Some(type_field) = event.get("@type") {
                                        if type_field == "error" {
                                            let _ =
                                                app_handle_clone.emit("tdlib-init-error", &event);
                                        }
                                    }
                                }
                            }
                        }

                        // 自动处理授权逻辑 (保持不变)
                        if let Some(type_field) = event.get("@type") {
                            if type_field == "updateAuthorizationState" {
                                if let Some(auth_state) = event.get("authorization_state") {
                                    if let Some(state_type) = auth_state.get("@type") {
                                        if state_type == "authorizationStateWaitTdlibParameters" {
                                            println!("Rust: Auto-handling setTdlibParameters...");
                                            let (api_id, api_hash, use_test_dc) = {
                                                let cfg = config_clone.lock().unwrap();
                                                (cfg.api_id, cfg.api_hash.clone(), cfg.use_test_dc)
                                            };
                                            // 使用绝对路径确保 TDLib 不依赖当前工作目录
                                            let db_dir = tdlib_db_dir.to_string_lossy().to_string();
                                            let files_dir =
                                                tdlib_files_dir.to_string_lossy().to_string();
                                            let request = json!({
                                                "@type": "setTdlibParameters",
                                                "use_test_dc": use_test_dc,
                                                "database_directory": db_dir,
                                                "files_directory": files_dir,
                                                "use_file_database": true,
                                                "use_chat_info_database": true,
                                                "use_message_database": true,
                                                "use_secret_chats": true,
                                                "api_id": api_id,
                                                "api_hash": api_hash,
                                                "system_language_code": "en",
                                                "device_model": "Desktop",
                                                "application_version": env!("CARGO_PKG_VERSION"),
                                                "enable_storage_optimizer": true,
                                                "@extra": { "request_id": "internal-setTdlibParameters" }
                                            });
                                            let req_str =
                                                CString::new(request.to_string()).unwrap();
                                            send_fn(client, req_str.as_ptr());
                                        }
                                    }
                                }
                            }
                        }

                        // 将 @type 转换为 _ 发送给前端
                        rename_json_key(&mut event, "@type", "_");

                        // 缓存 updateConnectionState 到 AppState，供前端首次加载时查询
                        if event.get("_").and_then(|v| v.as_str()) == Some("updateConnectionState")
                        {
                            if let Some(state_val) = event.get("state") {
                                if let Ok(state_json) = serde_json::to_string(state_val) {
                                    if let Ok(mut cs) = connection_state.lock() {
                                        *cs = Some(state_json);
                                    }
                                }
                            }
                        }

                        // 缓存 updateOption 到 AppState，供前端首次加载时查询
                        if event.get("_").and_then(|v| v.as_str()) == Some("updateOption") {
                            if let (Some(name), Some(value)) = (
                                event.get("name").and_then(|v| v.as_str()),
                                event.get("value"),
                            ) {
                                if let Ok(value_json) = serde_json::to_string(value) {
                                    if let Ok(mut opts) = options.lock() {
                                        opts.insert(name.to_string(), value_json);
                                    }
                                }
                            }
                        }

                        // 处理 对话 store 的更新
                        if let Some(events) = chat_store.lock().unwrap().handle_update(&event) {
                            for (event_name, payload) in events {
                                let _ = app_handle_clone.emit(&event_name, &payload);
                            }
                        }

                        // 处理下载管理器的 updateFile 事件
                        if event.get("_").and_then(|v| v.as_str()) == Some("updateFile") {
                            if let Some(file) = event.get("file") {
                                if let Some(file_id) = file.get("id").and_then(|v| v.as_i64()) {
                                    let downloaded_size = file
                                        .pointer("/local/downloaded_size")
                                        .and_then(|v| v.as_i64())
                                        .unwrap_or(0);
                                    let total_size =
                                        file.get("size").and_then(|v| v.as_i64()).unwrap_or(0);
                                    let expected = file
                                        .get("expected_size")
                                        .and_then(|v| v.as_i64())
                                        .unwrap_or(0);
                                    let effective_total =
                                        if total_size > 0 { total_size } else { expected };
                                    let is_dl_active = file
                                        .pointer("/local/is_downloading_active")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    let is_dl_completed = file
                                        .pointer("/local/is_downloading_completed")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    let local_path = file
                                        .pointer("/local/path")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());

                                    let mut dl_store = download_store.lock().unwrap();
                                    dl_store.update_progress(
                                        file_id as i32,
                                        downloaded_size,
                                        effective_total,
                                        is_dl_active,
                                        is_dl_completed,
                                        local_path.clone(),
                                    );

                                    // 发送下载进度更新事件（前端用于实时刷新）。
                                    // 即使未注册也创建轻量条目并 emit，
                                    // 让前端消息列表始终能跟踪文件下载进度。
                                    let item = dl_store
                                        .get_item(file_id as i32)
                                        .unwrap_or_else(|| {
                                            let name = file
                                                .pointer("/local/path")
                                                .and_then(|v| v.as_str())
                                                .map(|s| {
                                                    std::path::Path::new(s)
                                                        .file_name()
                                                        .and_then(|n| n.to_str())
                                                        .unwrap_or("")
                                                        .to_string()
                                                })
                                                .unwrap_or_default();
                                            DownloadItem {
                                                file_id: file_id as i32,
                                                file_name: name,
                                                chat_title: String::new(),
                                                chat_id: None,
                                                message_id: None,
                                                total_size: effective_total,
                                                downloaded_size,
                                                progress: if effective_total > 0 {
                                                    downloaded_size as f64
                                                        / effective_total as f64
                                                } else {
                                                    0.0
                                                },
                                                is_paused: !is_dl_active && !is_dl_completed,
                                                is_completed: is_dl_completed,
                                                local_path,
                                                thumbnail_data_url: None,
                                                file_type: "other".to_string(),
                                                is_generic: true,
                                                dismissed: false,
                                            }
                                        });
                                    let _ = app_handle_clone
                                        .emit("download-progress-update", &item);
                                }
                            }
                        }

                        // 如果是请求响应，发送到对应的 channel
                        if let Some(id) = request_id {
                            let mut map = pending_requests.lock().unwrap();
                            if let Some(sender) = map.remove(&id) {
                                if let serde_json::Value::Object(ref mut obj) = event {
                                    obj.remove("@extra");
                                }
                                let _ = sender.send(event);
                                continue; // 不再广播事件
                            }
                        }

                        // 发送事件到前端 (直接发送 Value 对象，Tauri 会自动序列化)
                        if let Err(e) = app_handle_clone.emit("tdlib-update", &event) {
                            eprintln!("Failed to emit event: {}", e);
                        }
                    }
                }
            }
        }
    });

    *tdlib_guard = Some(TdLibWrapper {
        _lib: lib,
        client,
        send_fn,
        _receive_fn: receive_fn,
        _execute_fn: execute_fn,
    });

    Ok(())
}

// --- 向 TDLib 发送 JSON 调用 ---
#[tauri::command]
pub async fn tdlib_send(
    state: State<'_, AppState>,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    send_request(state.inner(), request).await
}

pub async fn send_request(
    state: &AppState,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let (tx, rx) = oneshot::channel();
    // 仅在 debug 构建打印完整请求 JSON。生产 (release) 下每个请求都向 stdout 打印
    // 完整 payload（downloadFile/getChatHistory 等可能很大）会阻塞 I/O，拖慢数据灌入。
    #[cfg(debug_assertions)]
    println!("Sending request to TDLib: {}", request);
    // 使用代码块限制 MutexGuard 的生命周期
    {
        let guard = state.tdlib.lock().map_err(|e| e.to_string())?;
        if let Some(wrapper) = guard.as_ref() {
            let mut request = request;
            // 将前端传来的 _ 转换为 @type
            rename_json_key(&mut request, "_", "@type");

            // 生成 request_id
            let request_id = state.request_id_counter.fetch_add(1, Ordering::SeqCst);

            // 添加 @extra
            if let serde_json::Value::Object(ref mut map) = request {
                map.insert("@extra".to_string(), json!({ "request_id": request_id }));
            }

            // 存入 pending_requests
            {
                let mut map = state.pending_requests.lock().unwrap();
                map.insert(request_id, tx);
            }

            let request_str = request.to_string();
            let c_str = CString::new(request_str).map_err(|e| e.to_string())?;
            unsafe { (wrapper.send_fn)(wrapper.client, c_str.as_ptr()) };
        } else {
            return Err("TDLib not initialized".into());
        }
    } // guard 在这里被 drop，不再跨越 await 点

    // 等待响应
    match rx.await {
        Ok(response) => Ok(response),
        Err(_) => Err("Failed to receive response from TDLib".into()),
    }
}

#[tauri::command]
pub fn get_chat_lists(state: State<AppState>) -> Result<serde_json::Value, String> {
    let store = state.chat_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_all_chat_lists_value())
}

#[tauri::command]
pub fn get_chat_list(
    state: State<AppState>,
    list: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let store = state.chat_store.lock().map_err(|e| e.to_string())?;
    let list_key = ChatStore::get_list_key(&list).ok_or("Invalid chat list type")?;

    if let Some(list_state) = store.lists.get(&list_key) {
        // Collect chat objects for the chat ids if available
        let mut chats = Vec::new();
        for id in &list_state.chat_ids {
            if let Some(chat) = store.chats.get(id) {
                chats.push(chat.clone());
            }
        }

        Ok(json!({
            "list_key": list_key,
            "chat_ids": list_state.chat_ids,
            "chats": chats
        }))
    } else {
        Ok(json!({ "list_key": list_key, "chat_ids": [], "chats": [] }))
    }
}

// ==================== 下载管理器 Tauri 命令 ====================

#[tauri::command]
pub fn get_downloads(
    state: State<AppState>,
) -> Result<Vec<crate::download_store::DownloadItem>, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_all_items())
}

#[tauri::command]
pub fn get_download_active_count(state: State<AppState>) -> Result<usize, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_active_count())
}

#[tauri::command]
pub fn register_download(
    state: State<AppState>,
    file_id: i32,
    file_name: String,
    chat_title: String,
    total_size: i64,
    file_type: String,
    thumbnail_data_url: Option<String>,
    chat_id: Option<i64>,
    message_id: Option<i64>,
    is_generic: bool,
) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.register_download(
        file_id,
        file_name,
        chat_title,
        total_size,
        file_type,
        thumbnail_data_url,
        chat_id,
        message_id,
        is_generic,
    );
    Ok(())
}

#[tauri::command]
pub fn dismiss_download(state: State<AppState>, file_id: i32) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.dismiss_item(file_id);
    Ok(())
}

#[tauri::command]
pub fn clear_completed_downloads(state: State<AppState>) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.clear_completed();
    Ok(())
}

#[tauri::command]
pub fn get_show_hidden_downloads(state: State<AppState>) -> Result<bool, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_show_hidden())
}

#[tauri::command]
pub fn set_show_hidden_downloads(state: State<AppState>, value: bool) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.set_show_hidden(value);
    Ok(())
}

// ==================== 连接状态缓存命令 ====================

/// 返回 Rust 端缓存的最近一次 updateConnectionState 的 state 字段（JSON 字符串）。
/// 前端首次加载时调用此命令获取缓存状态，避免等待事件到达。
/// 如果从未收到过 updateConnectionState，返回 null。
#[tauri::command]
pub fn get_cached_connection_state(
    state: State<AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let cs = state.connection_state.lock().map_err(|e| e.to_string())?;
    match cs.as_ref() {
        Some(json_str) => {
            let v: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
            Ok(Some(v))
        }
        None => Ok(None),
    }
}

// ==================== Options 缓存命令 ====================

/// 返回 Rust 端缓存的所有 TDLib option 值（key → JSON Value）。
#[tauri::command]
pub fn get_cached_options(state: State<AppState>) -> Result<serde_json::Value, String> {
    let opts = state.options.lock().map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for (name, value_json) in opts.iter() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(value_json) {
            map.insert(name.clone(), v);
        }
    }
    Ok(serde_json::Value::Object(map))
}

/// 返回 Rust 端缓存的指定 option 值（JSON Value），未缓存则返回 null。
#[tauri::command]
pub fn get_cached_option(
    state: State<AppState>,
    name: String,
) -> Result<Option<serde_json::Value>, String> {
    let opts = state.options.lock().map_err(|e| e.to_string())?;
    match opts.get(&name) {
        Some(value_json) => {
            let v: serde_json::Value =
                serde_json::from_str(value_json).map_err(|e| e.to_string())?;
            Ok(Some(v))
        }
        None => Ok(None),
    }
}
