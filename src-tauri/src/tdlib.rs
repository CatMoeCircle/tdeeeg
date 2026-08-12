use crate::chat_store::ChatStore;
use crate::download_store::{DownloadItem, DownloadStore};
use libloading::{Library, Symbol};
use serde_json::json;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_void};
use std::path::PathBuf;
use std::time::Duration;
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

/// 前端保存的代理配置，供 TDLib 客户端创建后立即应用。
#[derive(Clone)]
pub struct ProxyConfig {
    /// disabled / system / custom
    pub mode: String,
    /// custom 模式下要启用的代理 ID（来自 getProxies）
    pub proxy_id: Option<i64>,
    pub proxy_type: String,
    pub server: String,
    pub port: String,
    pub username: String,
    pub password: String,
    pub secret: String,
    pub comment: String,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            mode: "disabled".into(),
            proxy_id: None,
            proxy_type: "http".into(),
            server: String::new(),
            port: String::new(),
            username: String::new(),
            password: String::new(),
            secret: String::new(),
            comment: String::new(),
        }
    }
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
    pub proxy_config: Arc<Mutex<ProxyConfig>>,
    pub chat_store: Arc<Mutex<ChatStore>>,
    pub download_store: Arc<Mutex<DownloadStore>>,
    /// 每个 TDLib file_id 的流式互斥锁（用于串行化同一文件的并发 range 下载，
    /// 但不同文件可并行流式传输，避免全局锁把视频流请求全部串行化）
    pub stream_locks: Mutex<HashMap<i32, Arc<Mutex<()>>>>,
    pub connection_state: Arc<Mutex<Option<String>>>,
    pub options: Arc<Mutex<HashMap<String, String>>>,
    /// 当前数据根目录（TDLib 数据 + 下载记录都存放于其下）
    pub data_dir: PathBuf,
    /// 迁移数据目录时，后台接收线程收到 authorizationStateClosed（资源释放完成）
    /// 后通过该 oneshot 通知等待方，然后才执行目录移动。
    pub close_signal: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
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
            proxy_config: Arc::new(Mutex::new(ProxyConfig::default())),
            chat_store: Arc::new(Mutex::new(ChatStore::new())),
            download_store: Arc::new(Mutex::new(DownloadStore::new(data_dir.clone()))),
            stream_locks: Mutex::new(HashMap::new()),
            connection_state: Arc::new(Mutex::new(None)),
            options: Arc::new(Mutex::new(HashMap::new())),
            data_dir,
            close_signal: Arc::new(Mutex::new(None)),
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

/// 根据本地文件扩展名推断上传任务的展示类型（与前端 DownloadFileType 对应）。
/// 图片 → photo，视频 → video，音频 → audio，其余 → document。
fn infer_upload_type(path: &str) -> String {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    const IMAGE_EXTS: &[&str] = &[
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif", "tif", "tiff", "ico",
    ];
    const VIDEO_EXTS: &[&str] = &[
        "mp4", "mov", "mkv", "avi", "webm", "m4v", "mpeg", "mpg", "wmv", "flv", "3gp", "ogv",
    ];
    const AUDIO_EXTS: &[&str] = &["mp3", "m4a", "aac", "ogg", "opus", "flac", "wav", "wma", "amr"];
    if IMAGE_EXTS.contains(&ext.as_str()) {
        "photo".to_string()
    } else if VIDEO_EXTS.contains(&ext.as_str()) {
        "video".to_string()
    } else if AUDIO_EXTS.contains(&ext.as_str()) {
        "audio".to_string()
    } else {
        "document".to_string()
    }
}

/// 构建 TDLib 的 addProxy 请求 JSON（根据代理类型）。
fn build_add_proxy_req(cfg: &ProxyConfig) -> serde_json::Value {
    let server = cfg.server.trim();
    let port: u16 = cfg.port.trim().parse().unwrap_or(0);

    let proxy_type = match cfg.proxy_type.as_str() {
        "socks5" => json!({
            "@type": "proxyTypeSocks5",
            "username": cfg.username,
            "password": cfg.password,
        }),
        "mtproto" => json!({
            "@type": "proxyTypeMtproto",
            "secret": cfg.secret,
        }),
        _ => json!({
            "@type": "proxyTypeHttp",
            "username": cfg.username,
            "password": cfg.password,
            "http_only": false,
        }),
    };

    json!({
        "@type": "addProxy",
        "proxy": {
            "@type": "proxy",
            "server": server,
            "port": port,
            "type": proxy_type,
        },
        "enable": true,
        "comment": cfg.comment,
    })
}

/// 将当前代理配置应用到已存在的 TDLib 客户端。
/// - mode=disabled → disableProxy
/// - mode=custom → enableProxy(proxy_id)（从代理列表选用已有代理）
/// - mode=system → 读取系统代理并 addProxy(enable=true)
///
/// 注：切换/启用代理后追加 setNetworkType(networkTypeOther) 强制所有网络连接重开，
/// 确保新代理立即生效（TDLib 文档：调用 setNetworkType 会强制所有连接重新打开，
/// 用于缓解切换网络/代理后的生效延迟）。
fn apply_proxy_to_client(send_fn: TdJsonClientSend, client: *mut c_void, cfg: &ProxyConfig) {
    // 构造要发送的请求序列
    let requests: Vec<serde_json::Value> = if cfg.mode == "disabled" {
        vec![json!({ "@type": "disableProxy" })]
    } else if cfg.mode == "custom" {
        match cfg.proxy_id {
            Some(id) => vec![
                json!({ "@type": "enableProxy", "proxy_id": id }),
                // 强制重连，使新代理立即生效
                json!({
                    "@type": "setNetworkType",
                    "type": { "@type": "networkTypeOther" }
                }),
            ],
            None => vec![json!({ "@type": "disableProxy" })],
        }
    } else {
        let mut effective = cfg.clone();
        // 系统代理：尝试读取系统代理地址；若未启用则退化为禁用代理
        if cfg.mode == "system" {
            match read_windows_system_proxy() {
                Some((host, port)) => {
                    effective.proxy_type = "http".to_string();
                    effective.server = host;
                    effective.port = port.to_string();
                }
                None => {
                    let req = json!({ "@type": "disableProxy" });
                    let req_str = CString::new(req.to_string()).unwrap();
                    unsafe { send_fn(client, req_str.as_ptr()) };
                    return;
                }
            }
        }
        vec![
            build_add_proxy_req(&effective),
            // 强制重连，使新代理立即生效
            json!({
                "@type": "setNetworkType",
                "type": { "@type": "networkTypeOther" }
            }),
        ]
    };
    for req in requests {
        let req_str = CString::new(req.to_string()).unwrap();
        unsafe { send_fn(client, req_str.as_ptr()) };
    }
}

/// 保存代理配置并立即应用到已运行的 TDLib 客户端。
/// 前端在应用启动（init_tdlib 之前）及修改代理设置时调用此命令。
#[tauri::command]
pub fn set_proxy_config(
    state: State<AppState>,
    mode: String,
    proxy_id: Option<i64>,
    proxy_type: Option<String>,
    server: Option<String>,
    port: Option<String>,
    username: Option<String>,
    password: Option<String>,
    secret: Option<String>,
    comment: Option<String>,
) -> Result<(), String> {
    {
        let mut cfg = state
            .proxy_config
            .lock()
            .map_err(|e| format!("Failed to lock proxy config: {e}"))?;
        cfg.mode = mode;
        if proxy_id.is_some() {
            cfg.proxy_id = proxy_id;
        }
        if let Some(v) = proxy_type {
            cfg.proxy_type = v;
        }
        if let Some(v) = server {
            cfg.server = v;
        }
        if let Some(v) = port {
            cfg.port = v;
        }
        if let Some(v) = username {
            cfg.username = v;
        }
        if let Some(v) = password {
            cfg.password = v;
        }
        if let Some(v) = secret {
            cfg.secret = v;
        }
        if let Some(v) = comment {
            cfg.comment = v;
        }
    }

    // 若客户端已创建，立即应用代理设置
    let tdlib_guard = state.tdlib.lock().map_err(|e| e.to_string())?;
    if let Some(wrapper) = tdlib_guard.as_ref() {
        let send_fn_copy = wrapper.send_fn;
        let client_copy = wrapper.client;
        let cfg = state
            .proxy_config
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        // TDLib 的 send 仅入队，非阻塞，可直接同步调用
        apply_proxy_to_client(send_fn_copy, client_copy, &cfg);
    }
    Ok(())
}

// --- 初始化 TDLib ---

/// 当前平台的 TDLib 动态库文件名。
fn tdjson_lib_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "tdjson.dll"
    }
    #[cfg(target_os = "macos")]
    {
        "libtdjson.dylib"
    }
    #[cfg(target_os = "linux")]
    {
        "libtdjson.so"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "tdjson"
    }
}

/// 候选的 TDLib 动态库搜索路径（可执行文件同级 + bin/ 子目录）。
fn tdjson_candidate_paths(exe_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let name = tdjson_lib_name();
    vec![
        exe_dir.join(name),
        exe_dir.join("bin").join(name),
        // macOS .app bundle：Contents/Resources（资源被打包到 Resources 目录时）
        exe_dir.join("Resources").join(name),
    ]
}

/// 在 Linux/macOS 上，先把 TDLib 所在目录中的同名依赖动态库以全局方式加载，
/// 使 tdjson 加载时能解析到其同目录依赖（libcrypto/libssl/zlib 等）。
/// Windows 依赖卸载由 SetDllDirectoryW 处理，此处仅处理 unix。
#[cfg(unix)]
fn preload_tdjson_dependencies(lib_dir: &std::path::Path, app_handle: &tauri::AppHandle) {
    // 加载时要让依赖库的符号全局可见，便于别的库链接到它们。
    // flags: RTLD_LAZY | RTLD_GLOBAL（各平台取值不同，用 cfg 定义）
    #[cfg(target_os = "macos")]
    const RTLD_FLAGS: i32 = 0x1 | 0x8; // RTLD_LAZY | RTLD_GLOBAL (macOS)
    #[cfg(not(target_os = "macos"))]
    const RTLD_FLAGS: i32 = 0x1 | 0x100; // RTLD_LAZY | RTLD_GLOBAL (Linux/其他)

    use std::os::unix::ffi::OsStrExt;

    let Ok(entries) = std::fs::read_dir(lib_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // 跳过 tdjson 本体（稍后单独加载）
        if path.file_name().and_then(|n| n.to_str()) == Some(tdjson_lib_name()) {
            continue;
        }
        // 加载 libtdjson 依赖的共享库（.so / .dylib）
        let is_lib = path
            .extension()
            .map(|e| e == "so" || e == "dylib")
            .unwrap_or(false);
        if is_lib {
            let _ = app_handle.emit("tdlib-log", format!("Preloading dependency: {:?}", path));
            // 使用 libloading 的 unix 接口以 RTLD_LAZY | RTLD_GLOBAL 加载，使符号全局可见
            unsafe {
                let _ = libloading::os::unix::Library::open(Some(&path), RTLD_FLAGS);
            }
        }
    }
}

#[tauri::command]
pub fn init_tdlib(app_handle: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut tdlib_guard = state.tdlib.lock().map_err(|e| e.to_string())?;

    if tdlib_guard.is_some() {
        return Ok(());
    }

    println!("Initializing TDLib...");

    // 1. 加载动态库
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Cannot get exe directory")?;

    let possible_paths = tdjson_candidate_paths(exe_dir);

    let mut dll_path = possible_paths[0].clone();
    let mut found = false;

    for path in &possible_paths {
        let _ = app_handle.emit("tdlib-log", format!("Checking library at: {:?}", path));
        if path.exists() {
            dll_path = path.clone();
            found = true;
            break;
        }
    }

    println!("Loading TDLib library from: {:?}", dll_path);
    let _ = app_handle.emit("tdlib-log", format!("Loading TDLib library from: {:?}", dll_path));

    if !found {
        let err_msg = format!(
            "{} not found. Checked paths: {:?}. Please ensure the TDLib dynamic library is placed correctly.",
            tdjson_lib_name(),
            possible_paths
        );
        let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
        return Err(err_msg);
    }

    // 如果库在 bin/ 子目录中，将其加入 Windows DLL 搜索路径以加载其依赖
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

    // Linux/macOS：先全局加载同目录依赖库，再加载 tdjson 本体
    #[cfg(unix)]
    if let Some(parent) = dll_path.parent() {
        preload_tdjson_dependencies(parent, &app_handle);
    }

    let lib = unsafe {
        Library::new(&dll_path).map_err(|e| {
            let err_msg = format!("Failed to load {}: {}", dll_path.display(), e);
            let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
            err_msg
        })?
    };
    let _ = app_handle.emit("tdlib-log", "TDLib library loaded successfully");
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
    let tdlib_data_dir = state.data_dir.join("TDLib");
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

    // 4. 应用前端保存的代理配置（在授权开始前生效，TDLib 允许 addProxy/disableProxy 在授权前调用）
    {
        let cfg = state
            .proxy_config
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        if cfg.mode != "disabled" {
            apply_proxy_to_client(send_fn, client, &cfg);
        }
    }

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
    let close_signal = state.close_signal.clone();
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
                        // 资源释放完成（客户端已 close）：通知迁移等待方
                        if event.get("@type").and_then(|v| v.as_str())
                            == Some("updateAuthorizationState")
                        {
                            if let Some(state_type) = event
                                .get("authorization_state")
                                .and_then(|v| v.get("@type"))
                                .and_then(|v| v.as_str())
                            {
                                if state_type == "authorizationStateClosed" {
                                    if let Ok(mut sig) = close_signal.lock() {
                                        if let Some(tx) = sig.take() {
                                            let _ = tx.send(());
                                        }
                                    }
                                }
                            }
                        }
                        // 打印收到的 update（调试），仅在 debug 构建打印
                        #[cfg(debug_assertions)]
                        if let Some(t) = event.get("@type").and_then(|v| v.as_str()) {
                            if t == "error" {
                                println!("[tdlib-update] error: {}", json_str);
                            } else {
                                println!("[tdlib-update] {}", t);
                            }
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
                                    let item =
                                        dl_store.get_item(file_id as i32).unwrap_or_else(|| {
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
                                                    downloaded_size as f64 / effective_total as f64
                                                } else {
                                                    0.0
                                                },
                                                is_paused: !is_dl_active && !is_dl_completed,
                                                is_completed: is_dl_completed,
                                                local_path,
                                                thumbnail_data_url: None,
                                                file_type: "other".to_string(),
                                                is_generic: true,
                                                hidden_category: None,
                                                is_auto_photo: false,
                                                is_streaming: false,
                                                dismissed: false,
                                                is_upload: false,
                                            }
                                        });
                                    let _ =
                                        app_handle_clone.emit("download-progress-update", &item);
                                }
                            }
                        }

                        // 处理上传（发送文件）进度。TDLib 在上传文件时同样会推送
                        // updateFile，其中 file.remote 的 is_uploading_active /
                        // uploaded_size 表示上传状态/进度。
                        //
                        // 注意：remote.is_uploading_completed 只表示「远端副本可用」，
                        // 对任何从服务器下载到本地的文件（如自动下载的图片/视频）也为
                        // true，因此不能作为上传标识！这里**仅以 is_uploading_active 判定
                        // 上传**，自动下载的文件其 is_uploading_active 恒为 false，不会误判。
                        if event.get("_").and_then(|v| v.as_str()) == Some("updateFile") {
                            if let Some(file) = event.get("file") {
                                if let Some(file_id) = file.get("id").and_then(|v| v.as_i64()) {
                                    let is_up_active = file
                                        .pointer("/remote/is_uploading_active")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false);
                                    // 非上传（下载/仅本地文件）直接跳过
                                    if is_up_active {
                                        let uploaded_size = file
                                            .pointer("/remote/uploaded_size")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let total_size = file
                                            .get("size")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let expected = file
                                            .get("expected_size")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let effective_total =
                                            if total_size > 0 { total_size } else { expected };
                                        // 已完成 = 已上传大小达到总大小（total 已知时）
                                        let is_up_completed =
                                            effective_total > 0 && uploaded_size >= effective_total;

                                        // 该文件的来源本地路径（用于去重）
                                        let local_path = file
                                            .pointer("/local/path")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string());

                                        let mut ul_store = download_store.lock().unwrap();
                                        // 注册/确保上传记录。updateFile 会为同一源文件可能
                                        // 推送多次/多个 file_id（如原始文件 + 缩略图/封面），
                                        // register_upload 内部会按 local_path 去重并迁移 file_id，
                                        // 确保「上传」区每个源文件只出现一条。
                                        let (name, file_type) = local_path
                                            .as_deref()
                                            .map(|s| {
                                                let p = std::path::Path::new(s);
                                                let display = p
                                                    .file_name()
                                                    .and_then(|n| n.to_str())
                                                    .unwrap_or("")
                                                    .to_string();
                                                let t = infer_upload_type(s);
                                                (display, t)
                                            })
                                            .unwrap_or_else(|| {
                                                (format!("文件 #{}", file_id), "other".to_string())
                                            });
                                        ul_store.register_upload(
                                            file_id as i32,
                                            name,
                                            file_type,
                                            String::new(),
                                            effective_total,
                                            None,
                                            local_path,
                                        );
                                        if let Some(item) = ul_store.update_upload_progress(
                                            file_id as i32,
                                            uploaded_size,
                                            effective_total,
                                            is_up_active,
                                            is_up_completed,
                                        ) {
                                            let _ = app_handle_clone.emit(
                                                "upload-progress-update",
                                                &item,
                                            );
                                        }
                                    }
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
    hidden_category: Option<String>,
    is_auto_photo: bool,
    is_streaming: bool,
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
        hidden_category,
        is_auto_photo,
        is_streaming,
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

#[tauri::command]
pub fn get_show_auto_photos_downloads(state: State<AppState>) -> Result<bool, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_show_auto_photos())
}

#[tauri::command]
pub fn set_show_auto_photos_downloads(state: State<AppState>, value: bool) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.set_show_auto_photos(value);
    Ok(())
}

// ==================== 上传任务（发送文件）命令 ====================

/// 获取全部上传任务（进行中 + 已完成）
#[tauri::command]
pub fn get_uploads(
    state: State<AppState>,
) -> Result<Vec<crate::download_store::DownloadItem>, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_uploads())
}

/// 手动关闭/移除一个上传任务
#[tauri::command]
pub fn dismiss_upload(state: State<AppState>, file_id: i32) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.dismiss_upload(file_id);
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

// ==================== 系统代理命令 ====================

/// 从 Windows 注册表读取系统代理，返回 (host, port)。系统代理未启用时返回 None。
/// 仅在 Windows 上实现；其他平台返回 None。
fn read_windows_system_proxy() -> Option<(String, u16)> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let settings_path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
        let settings = hkcu.open_subkey(settings_path).ok()?;

        // ProxyEnable == 1 表示启用了系统代理
        let proxy_enable: u32 = settings.get_value("ProxyEnable").unwrap_or(0);
        if proxy_enable != 1 {
            return None;
        }

        // ProxyServer 形如 "host:port" 或 "http=host:port;https=host:port"
        let proxy_server: String = settings.get_value("ProxyServer").ok()?;
        if proxy_server.trim().is_empty() {
            return None;
        }

        // 处理分协议配置：优先取 http=... 段，其次 https=... 段
        let candidate = proxy_server
            .split(';')
            .map(|s| s.trim())
            .find(|s| s.starts_with("http="))
            .or_else(|| {
                proxy_server
                    .split(';')
                    .map(|s| s.trim())
                    .find(|s| s.starts_with("https="))
            })
            .unwrap_or(proxy_server.trim());

        // 去掉可能的协议前缀
        let host_port = candidate
            .split_once("://")
            .map(|(_, rest)| rest)
            .unwrap_or(candidate);

        let (host, port) = host_port.rsplit_once(':')?;
        let port_num: u16 = port.trim().parse().ok()?;
        let host = host.trim().trim_matches('"');
        if host.is_empty() {
            return None;
        }
        Some((host.to_string(), port_num))
    }

    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// 读取 Windows 系统代理设置（注册表 Internet Settings）。
/// 返回 `{ "server": String, "port": u16, "username": String, "password": String }`，
/// 其中 username/password 可能为空字符串。若系统代理未启用则返回 null。
///
/// 仅在 Windows 上有效；其他平台返回 null（由前端自行处理）。
#[tauri::command]
pub fn get_system_proxy() -> Result<Option<serde_json::Value>, String> {
    match read_windows_system_proxy() {
        Some((host, port)) => Ok(Some(json!({
            "server": host,
            "port": port,
            "username": "",
            "password": "",
        }))),
        None => Ok(None),
    }
}

// ==================== 数据存储位置 / 迁移命令 ====================

/// 向前端发送迁移进度事件。
fn emit_migration_progress(app: &tauri::AppHandle, percent: u32, stage: &str, message: impl std::fmt::Display) {
    let _ = app.emit(
        "data-migration-progress",
        json!({ "percent": percent, "stage": stage, "message": message.to_string() }),
    );
}

/// 返回当前数据存储位置信息。
#[tauri::command]
pub fn get_data_location(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<serde_json::Value, String> {
    let mode = crate::data_loc::read_mode(&app);
    let current_dir = state.data_dir.clone();
    let appdata_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let portable_dir = crate::data_loc::resolve_data_dir(&app, crate::data_loc::DataMode::Portable)?;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;

    // 统计当前数据目录中 TDLib 数据与下载记录的大致体积
    let mut tdlib_size: u64 = 0;
    let mut downloads_size: u64 = 0;
    fn dir_size(dir: &std::path::Path) -> u64 {
        fn walk(dir: &std::path::Path) -> u64 {
            let mut total = 0u64;
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        total += walk(&p);
                    } else if let Ok(meta) = p.metadata() {
                        total += meta.len();
                    }
                }
            }
            total
        }
        walk(dir)
    }
    let tdlib_dir = current_dir.join("TDLib");
    let dl_dir = current_dir.join("downloads");
    if tdlib_dir.is_dir() {
        tdlib_size = dir_size(&tdlib_dir);
    }
    if dl_dir.is_dir() {
        downloads_size = dir_size(&dl_dir);
    }

    Ok(json!({
        "mode": mode.as_str(),
        "current_dir": current_dir.to_string_lossy().to_string(),
        "appdata_dir": appdata_dir.to_string_lossy().to_string(),
        "portable_dir": portable_dir.to_string_lossy().to_string(),
        "config_dir": config_dir.to_string_lossy().to_string(),
        "tdlib_size": tdlib_size,
        "downloads_size": downloads_size,
        "total_size": tdlib_size + downloads_size,
    }))
}

/// 把数据目录整棵移动（源到目标）。源不存在时直接返回成功（首次迁移到新位置）。
fn move_data_tree(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    if dst.exists() {
        // 目标已有内容：先备份目标（改名 .bak-<时间戳>），避免覆盖既有数据
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let bak = std::path::PathBuf::from(format!("{}.bak-{}", dst.to_string_lossy(), ts));
        std::fs::rename(dst, &bak).map_err(|e| format!("备份目标目录失败 {}: {e}", dst.display()))?;
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目标父目录 {}: {e}", parent.display()))?;
    }
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) => {
            // Windows 上跨盘（如 C: → D:）rename 会失败，退化为复制+删除
            copy_and_remove(src, dst).map_err(|copy_err| {
                format!("移动目录失败 {}: {e} / {copy_err}", src.display())
            })
        }
    }
}

/// 跨卷复制目录后删除源（作为 rename 失败的兜底）。
fn copy_and_remove(src: &std::path::Path, dst: &std::path::Path) -> Result<(), std::io::Error> {
    fn copy_dir(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            let src_path = entry.path();
            let dst_path = to.join(entry.file_name());
            if src_path.is_dir() {
                copy_dir(&src_path, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }
    copy_dir(src, dst)?;
    std::fs::remove_dir_all(src)?;
    Ok(())
}

/// 迁移数据目录到目标模式，并在完成后重启应用。
///
/// 流程：
/// 1. 向 TDLib 发送 close，等待 authorizationStateClosed（资源释放更新）；
/// 2. 移动 TDLib 数据目录（tdlib_db/tdlib_files）与下载记录（downloads）到新位置；
/// 3. 持久化新的存储模式；
/// 4. 重启应用，重启后 TDLib 数据目录指向新位置。
#[tauri::command]
pub async fn migrate_data_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mode: String,
) -> Result<(), String> {
    use crate::data_loc::DataMode;
    let target_mode = match mode.as_str() {
        "appdata" => DataMode::AppData,
        "portable" => DataMode::Portable,
        other => return Err(format!("未知的存储模式: {other}")),
    };

    let current_mode = crate::data_loc::read_mode(&app);
    if current_mode == target_mode {
        return Ok(()); // 已经是目标模式，无需迁移
    }

    let target_dir = crate::data_loc::resolve_data_dir(&app, target_mode)?;

    emit_migration_progress(&app, 5, "prepare", "准备迁移…");

    // 1. 关闭 TDLib，等待资源释放
    let client_closed = {
        let guard = state.tdlib.lock().map_err(|e| e.to_string())?;
        let wrapper = guard.as_ref().ok_or("TDLib 尚未初始化，无法迁移")?;
        let (tx, rx) = oneshot::channel::<()>();
        {
            let mut sig = state.close_signal.lock().map_err(|e| e.to_string())?;
            *sig = Some(tx);
        }
        let close_req = json!({ "@type": "close", "@extra": { "request_id": "internal-close" } });
        let c_str = CString::new(close_req.to_string()).unwrap();
        unsafe { (wrapper.send_fn)(wrapper.client, c_str.as_ptr()) };
        emit_migration_progress(&app, 10, "close", "正在关闭 TDLib，等待资源释放…");
        rx
    };

    // 等待 authorizationStateClosed，最多 30 秒
    let closed = tokio::time::timeout(Duration::from_secs(30), client_closed)
        .await
        .map_err(|_| "等待 TDLib 资源释放超时，迁移已取消".to_string())?;
    if closed.is_err() {
        return Err("TDLib 关闭通道异常".to_string());
    }
    emit_migration_progress(&app, 40, "released", "资源已释放，开始移动数据…");

    // 2. 移动数据
    let src_dir = state.data_dir.clone();
    let mut failed = None::<String>;
    // TDLib 数据
    emit_migration_progress(&app, 50, "move", "移动 TDLib 数据库…");
    if let Err(e) = move_data_tree(&src_dir.join("TDLib"), &target_dir.join("TDLib")) {
        failed = Some(e);
    }
    emit_migration_progress(&app, 75, "move", "移动下载记录…");
    if let Err(e) = move_data_tree(&src_dir.join("downloads"), &target_dir.join("downloads")) {
        if failed.is_none() {
            failed = Some(e);
        }
    }
    emit_migration_progress(&app, 90, "config", "保存存储位置配置…");

    if let Some(err) = failed {
        // 移动过程中出错：恢复为原模式（保证应用仍能启动），并提示错误后重启。
        emit_migration_progress(&app, 95, "error", format!("迁移出错：{err}"));
        let _ = crate::data_loc::write_mode(&app, current_mode);
    } else {
        // 3. 持久化新模式（成功）
        if let Err(e) = crate::data_loc::write_mode(&app, target_mode) {
            emit_migration_progress(&app, 95, "error", format!("保存配置失败：{e}"));
            let _ = crate::data_loc::write_mode(&app, current_mode);
        } else {
            emit_migration_progress(&app, 100, "done", "迁移完成，正在重启应用…");
        }
    }

    // 略微延迟，让进度事件送达前端后再重启（无论成败都重启以恢复一致状态）
    tokio::time::sleep(Duration::from_millis(800)).await;

    // 4. 重启应用（重启后 TDLib 数据目录将指向配置的位置）
    //    注意：restart() 会终止当前进程，后续代码不会执行。
    app.restart();
}
