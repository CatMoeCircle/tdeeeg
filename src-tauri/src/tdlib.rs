use crate::accounts::AccountsStore;
use crate::chat_store::ChatStore;
use crate::download_store::{DownloadItem, DownloadStore};
use libloading::{Library, Symbol};
use serde_json::json;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_void};
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use std::ptr;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
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
    /// disabled / auto / system / custom
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
type TdJsonClientDestroy = unsafe extern "C" fn(client: *mut c_void);

// --- 共享的动态库与函数符号（所有账户共用一份） ---
pub struct TdLibShared {
    _lib: Library,
    create_fn: TdJsonClientCreate,
    send_fn: TdJsonClientSend,
    receive_fn: TdJsonClientReceive,
    #[allow(dead_code)]
    execute_fn: TdJsonClientExecute,
    destroy_fn: TdJsonClientDestroy,
}

/// 单个账户对应的 TDLib 客户端实例。
/// 每个账户拥有独立的 client、独立的事件循环线程、独立的本地缓存
/// （聊天缓存、连接状态、options、自己的 user 信息与头像）。
pub struct TdLibClient {
    pub id: i64,
    pub client: *mut c_void,
    pub destroy_fn: TdJsonClientDestroy,
    pub close_signal: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    pub chat_store: Arc<Mutex<ChatStore>>,
    pub connection_state: Arc<Mutex<Option<String>>>,
    pub options: Arc<Mutex<HashMap<String, String>>>,
    /// getMe 返回的 user 对象缓存
    pub me: Mutex<Option<serde_json::Value>>,
    /// 自己的 user id（Options.MyId 的等价物，来自 getMe）
    pub my_id: Mutex<Option<i64>>,
    /// 自己头像 small 文件的 file id（用于追踪头像下载完成）
    pub avatar_file_id: Mutex<Option<i32>>,
    /// 已下载头像的本地路径
    pub avatar_path: Mutex<Option<String>>,
    /// 最近一次授权态 @type
    pub authorization_state: Mutex<Option<String>>,
}

impl Drop for TdLibClient {
    fn drop(&mut self) {
        if !self.client.is_null() {
            unsafe { (self.destroy_fn)(self.client) };
            self.client = ptr::null_mut();
        }
    }
}

unsafe impl Send for TdLibClient {}
unsafe impl Sync for TdLibClient {}

/// 账户的运行时元数据（是否已登录、头像本地路径）。
pub struct AccountRuntimeMeta {
    pub logged_in: bool,
    pub avatar_path: Option<String>,
}

pub struct AppState {
    /// 共享的 TDLib 动态库与函数符号（加载一次，供所有账户复用）
    pub tdlib_shared: Mutex<Option<Arc<TdLibShared>>>,
    /// 所有账户客户端实例：session_id → client
    pub clients: Mutex<HashMap<i64, Arc<TdLibClient>>>,
    /// 当前活动账户的 session_id
    pub active: Arc<AtomicI64>,
    /// 全局请求响应通道（request_id 全局唯一，安全跨 client 复用）
    pub pending_requests: Arc<Mutex<HashMap<i64, oneshot::Sender<serde_json::Value>>>>,
    pub request_id_counter: AtomicI64,
    pub config: Arc<Mutex<TdLibConfig>>,
    pub proxy_config: Arc<Mutex<ProxyConfig>>,
    pub download_store: Arc<Mutex<DownloadStore>>,
    /// 每个 TDLib file_id 的流式互斥锁
    pub stream_locks: Mutex<HashMap<i32, Arc<Mutex<()>>>>,
    /// 当前数据根目录（TDLib 数据 + 下载记录都存放于其下）
    pub data_dir: PathBuf,
    /// 账户清单（持久化）
    pub accounts: Arc<Mutex<AccountsStore>>,
    /// 账户运行时元数据（内存）
    pub account_meta: Arc<Mutex<HashMap<i64, AccountRuntimeMeta>>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let accounts = AccountsStore::load(data_dir.join("accounts.json"));
        let active = accounts.active();
        Self {
            tdlib_shared: Mutex::new(None),
            clients: Mutex::new(HashMap::new()),
            active: Arc::new(AtomicI64::new(active)),
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
            download_store: Arc::new(Mutex::new(DownloadStore::new(data_dir.clone()))),
            stream_locks: Mutex::new(HashMap::new()),
            data_dir,
            accounts: Arc::new(Mutex::new(accounts)),
            account_meta: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// 取共享动态库（若尚未加载返回 None）。
fn shared(state: &AppState) -> Result<Arc<TdLibShared>, String> {
    state
        .tdlib_shared
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "TDLib not initialized".into())
}

/// 取活动账户对应的 client。
fn active_client(state: &AppState) -> Result<Arc<TdLibClient>, String> {
    let id = state.active.load(Ordering::SeqCst);
    let clients = state.clients.lock().map_err(|e| e.to_string())?;
    clients
        .get(&id)
        .cloned()
        .ok_or_else(|| "TDLib not initialized".into())
}

/// 构建给前端的账户列表。
fn build_accounts_payload(state: &AppState) -> Result<Vec<serde_json::Value>, String> {
    let meta = state.account_meta.lock().map_err(|e| e.to_string())?;
    let accounts = state.accounts.lock().map_err(|e| e.to_string())?;
    let active = state.active.load(Ordering::SeqCst);
    Ok(accounts
        .records()
        .iter()
        .map(|rec| {
            let m = meta.get(&rec.id);
            json!({
                "id": rec.id,
                "first_name": rec.first_name,
                "last_name": rec.last_name,
                "username": rec.username,
                "logged_in": m.map(|x| x.logged_in).unwrap_or(false),
                "avatar_path": m.and_then(|x| x.avatar_path.clone()),
                "is_active": rec.id == active,
            })
        })
        .collect())
}

/// 账户的 TDLib 数据子目录（database / files）。
pub fn account_db_dir(data_dir: &std::path::Path, id: i64) -> PathBuf {
    data_dir
        .join("TDLib")
        .join("accounts")
        .join(id.to_string())
        .join("tdlib_db")
}
pub fn account_files_dir(data_dir: &std::path::Path, id: i64) -> PathBuf {
    data_dir
        .join("TDLib")
        .join("accounts")
        .join(id.to_string())
        .join("tdlib_files")
}

// --- TDLib 自定义启动参数 ---
#[tauri::command]
pub fn set_tdlib_parameters(
    state: State<AppState>,
    api_id: Option<i32>,
    api_hash: Option<String>,
    use_test_dc: Option<bool>,
    persist: Option<bool>,
) -> Result<(), String> {
    let has_creds = api_id.is_some() && api_hash.is_some();
    let has_test_dc = use_test_dc.is_some();

    if api_id.is_some() != api_hash.is_some() {
        return Err("api_id and api_hash must be provided together".to_string());
    }

    if !has_creds && !has_test_dc {
        return Err("No parameters provided to update".to_string());
    }

    let should_persist = persist.unwrap_or(false);

    // 更新全局 config
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        if let Some(test_dc) = use_test_dc {
            config.use_test_dc = test_dc;
        }
        if let (Some(id), Some(hash)) = (api_id.as_ref(), api_hash.as_ref()) {
            if *id <= 0 {
                return Err("Invalid api_id: must be greater than 0".to_string());
            }
            if hash.trim().is_empty() {
                return Err("Invalid api_hash: cannot be empty".to_string());
            }
            config.api_id = *id;
            config.api_hash = hash.clone();
        }
    }

    // persist=true 时将凭据持久化到活动账户的记录中。
    // 内置凭据（无自定义 api_id/api_hash）不保存 api_id/hash 到磁盘，防止泄露。
    if should_persist {
        let active_id = state.active.load(Ordering::SeqCst);
        let cfg = state.config.lock().map_err(|e| e.to_string())?;
        if let Ok(mut accounts) = state.accounts.lock() {
            accounts.set_tdlib_params(
                active_id,
                api_id,
                api_hash.as_deref(),
                cfg.use_test_dc,
                has_creds,
            );
        }
    }
    Ok(())
}

// --- 客户端生命周期 ---

/// 向指定账户发送 close/logOut 并等待 authorizationStateClosed，
/// 然后从 `clients` 移除该账户（Arc drop 会销毁底层客户端）。
/// 返回后该账户不再存在于 clients 中。
async fn shutdown_client(state: &AppState, session_id: i64, action: &str) -> Result<(), String> {
    let sh = shared(state)?;
    let (send_fn, client_ptr, close_signal) = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        let client = clients
            .get(&session_id)
            .ok_or_else(|| format!("账户 {session_id} 不存在或未初始化"))?;
        (sh.send_fn, client.client, client.close_signal.clone())
    };

    let (tx, rx) = oneshot::channel::<()>();
    {
        let mut sig = close_signal.lock().map_err(|e| e.to_string())?;
        *sig = Some(tx);
    }
    let req = json!({ "@type": action, "@extra": { "request_id": "internal-shutdown" } });
    let c_str = CString::new(req.to_string()).unwrap();
    unsafe { send_fn(client_ptr, c_str.as_ptr()) };

    tokio::time::timeout(Duration::from_secs(30), rx)
        .await
        .map_err(|_| "等待 TDLib 资源释放超时".to_string())?
        .map_err(|_| "TDLib 关闭通道异常".to_string())?;

    let mut clients = state.clients.lock().map_err(|e| e.to_string())?;
    clients.remove(&session_id);
    Ok(())
}

/// 关闭所有账户的客户端（迁移数据目录时使用）。
async fn shutdown_all_clients(state: &AppState) -> Result<(), String> {
    let ids: Vec<i64> = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.keys().cloned().collect()
    };
    for id in ids {
        shutdown_client(state, id, "close").await?;
    }
    Ok(())
}

/// 用当前已保存的参数（use_test_dc / api_id / api_hash）重建活动账户的客户端。
#[tauri::command]
pub async fn restart_tdlib(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_id = state.active.load(Ordering::SeqCst);
    shutdown_client(state.inner(), session_id, "close").await?;
    create_client(&app_handle, state.inner(), session_id)?;
    Ok(())
}

/// 退出当前账户登录：logOut（销毁本地数据），然后重建该账户客户端进入待登录状态。
/// 保留供「系统设置」旧流程使用；多账户下更推荐 logout_account。
#[tauri::command]
pub async fn logout_tdlib(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_id = state.active.load(Ordering::SeqCst);
    shutdown_client(state.inner(), session_id, "logOut").await?;
    // 清理账户目录残留后重建
    let dir = state
        .data_dir
        .join("TDLib")
        .join("accounts")
        .join(session_id.to_string());
    let _ = std::fs::remove_dir_all(&dir);
    create_client(&app_handle, state.inner(), session_id)?;
    Ok(())
}

// --- 账户管理命令 ---

#[tauri::command]
pub fn get_accounts(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    build_accounts_payload(state.inner())
}

/// 新增一个账户：分配新 id，创建其客户端（未登录态），并设为活动账户。
/// 返回新账户的 id。前端随后 reload 进入登录流程。
#[tauri::command]
pub fn add_account(app_handle: tauri::AppHandle, state: State<AppState>) -> Result<i64, String> {
    ensure_shared_loaded(&app_handle, state.inner())?;
    let id = {
        let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        let id = accounts.add();
        accounts.set_active(id)?;
        id
    };
    state.active.store(id, Ordering::SeqCst);
    create_client(&app_handle, state.inner(), id)?;
    Ok(id)
}

/// 切换活动账户。
#[tauri::command]
pub fn switch_account(state: State<AppState>, session_id: i64) -> Result<(), String> {
    {
        let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        accounts.set_active(session_id)?;
    }
    state.active.store(session_id, Ordering::SeqCst);
    Ok(())
}

/// 登出并移除指定账户；若移除的是活动账户，则自动切换到剩余账户。
/// 未登录的账户直接移除（无需 logOut）。
#[tauri::command]
pub async fn logout_account(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<(), String> {
    let logged_in = {
        let meta = state.account_meta.lock().map_err(|e| e.to_string())?;
        meta.get(&session_id).map(|m| m.logged_in).unwrap_or(false)
    };

    let client_exists = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.contains_key(&session_id)
    };

    if client_exists {
        if logged_in {
            shutdown_client(state.inner(), session_id, "logOut").await?;
        } else {
            // 未登录：直接释放客户端（无需 logOut）
            let mut clients = state.clients.lock().map_err(|e| e.to_string())?;
            clients.remove(&session_id);
        }
    }

    // 删除本地数据目录
    let dir = state
        .data_dir
        .join("TDLib")
        .join("accounts")
        .join(session_id.to_string());
    let _ = std::fs::remove_dir_all(&dir);

    // 从清单移除（内部会自动处理活动账户切换）
    let new_active = {
        let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        accounts.remove(session_id)?;
        accounts.active()
    };
    state.active.store(new_active, Ordering::SeqCst);

    // 从运行时元数据移除
    if let Ok(mut meta) = state.account_meta.lock() {
        meta.remove(&session_id);
    }

    // 若新的活动账户客户端尚未创建（例如被移除的是唯一账户后重建的空账户），补建。
    let exists = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.contains_key(&new_active)
    };
    if !exists {
        create_client(&app_handle, state.inner(), new_active)?;
    }

    Ok(())
}

// --- 上传类型推断 ---

/// 根据本地文件扩展名推断上传任务的展示类型（与前端 DownloadFileType 对应）。
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
    const AUDIO_EXTS: &[&str] = &[
        "mp3", "m4a", "aac", "ogg", "opus", "flac", "wav", "wma", "amr",
    ];
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

/// 解析当前代理配置，返回要发送给 TDLib 的请求列表。
/// system/auto 模式下若无法读取系统代理则发送 disableProxy。
fn resolve_proxy_requests(
    send_fn: TdJsonClientSend,
    client: *mut c_void,
    cfg: &ProxyConfig,
) -> Vec<serde_json::Value> {
    let mut result: Vec<serde_json::Value> = Vec::new();
    if cfg.mode == "disabled" {
        result.push(json!({ "@type": "disableProxy" }));
    } else if cfg.mode == "custom" {
        match cfg.proxy_id {
            Some(id) => {
                result.push(json!({ "@type": "enableProxy", "proxy_id": id }));
                result.push(
                    json!({ "@type": "setNetworkType", "type": { "@type": "networkTypeOther" } }),
                );
            }
            None => {
                result.push(json!({ "@type": "disableProxy" }));
            }
        }
    } else if cfg.mode == "system" || cfg.mode == "auto" {
        match read_windows_system_proxy() {
            Some((host, port)) => {
                let mut effective = cfg.clone();
                effective.proxy_type = "http".to_string();
                effective.server = host;
                effective.port = port.to_string();
                result.push(build_add_proxy_req(&effective));
                result.push(
                    json!({ "@type": "setNetworkType", "type": { "@type": "networkTypeOther" } }),
                );
            }
            None => {
                // 无法读取系统代理，发送 disableProxy
                let req = json!({ "@type": "disableProxy" });
                let req_str = CString::new(req.to_string()).unwrap();
                unsafe { send_fn(client, req_str.as_ptr()) };
            }
        }
    } else {
        result.push(build_add_proxy_req(cfg));
        result.push(json!({ "@type": "setNetworkType", "type": { "@type": "networkTypeOther" } }));
    }
    result
}

/// 将当前代理配置应用到指定 TDLib 客户端。
fn apply_proxy_to_client(send_fn: TdJsonClientSend, client: *mut c_void, cfg: &ProxyConfig) {
    let requests = resolve_proxy_requests(send_fn, client, cfg);
    for req in requests {
        let req_str = CString::new(req.to_string()).unwrap();
        unsafe { send_fn(client, req_str.as_ptr()) };
    }
}

/// 保存代理配置并立即应用到所有已运行的 TDLib 客户端。
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

    // 应用到所有已创建的客户端
    let cfg = state
        .proxy_config
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let send_fn = shared(state.inner())?.send_fn;
    let clients = state.clients.lock().map_err(|e| e.to_string())?;
    for client in clients.values() {
        apply_proxy_to_client(send_fn, client.client, &cfg);
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
    let mut out: Vec<std::path::PathBuf> = Vec::new();
    out.push(exe_dir.join(name));
    out.push(exe_dir.join("bin").join(name));
    out.push(exe_dir.join("Resources").join(name));
    out
}

#[cfg(unix)]
fn preload_tdjson_dependencies(lib_dir: &std::path::Path, app_handle: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    const RTLD_FLAGS: i32 = 0x1 | 0x8;
    #[cfg(not(target_os = "macos"))]
    const RTLD_FLAGS: i32 = 0x1 | 0x100;

    use std::os::unix::ffi::OsStrExt;

    let Ok(entries) = std::fs::read_dir(lib_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|n| n.to_str()) == Some(tdjson_lib_name()) {
            continue;
        }
        let is_lib = path
            .extension()
            .map(|e| e == "so" || e == "dylib")
            .unwrap_or(false);
        if is_lib {
            unsafe {
                let _ = libloading::os::unix::Library::open(Some(&path), RTLD_FLAGS);
            }
        }
    }
}

/// 首次调用时加载 TDLib 动态库（todo：也可由 init_tdlib 在启动时完成）。
fn ensure_shared_loaded(
    app_handle: &tauri::AppHandle,
    state: &AppState,
) -> Result<Arc<TdLibShared>, String> {
    if let Some(sh) = state
        .tdlib_shared
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
    {
        return Ok(sh);
    }

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

    if !found {
        let err_msg = format!(
            "{} not found. Checked paths: {:?}. Please ensure the TDLib dynamic library is placed correctly.",
            tdjson_lib_name(),
            possible_paths
        );
        let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
        return Err(err_msg);
    }

    #[cfg(windows)]
    if let Some(parent) = dll_path.parent() {
        if parent != exe_dir {
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

    #[cfg(unix)]
    if let Some(parent) = dll_path.parent() {
        preload_tdjson_dependencies(parent, app_handle);
    }

    let lib = unsafe {
        Library::new(&dll_path).map_err(|e| {
            let err_msg = format!("Failed to load {}: {}", dll_path.display(), e);
            let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
            err_msg
        })?
    };
    let _ = app_handle.emit("tdlib-log", "TDLib library loaded successfully");

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
    let client_destroy: Symbol<TdJsonClientDestroy> = unsafe {
        lib.get(b"td_json_client_destroy")
            .map_err(|e| e.to_string())?
    };

    let create_fn = *client_create;
    let send_fn = *client_send;
    let receive_fn = *client_receive;
    let execute_fn = *client_execute;
    let destroy_fn = *client_destroy;

    // 设置日志等级
    let log_config =
        CString::new(r#"{"@type": "setLogVerbosityLevel", "new_verbosity_level": 1}"#).unwrap();
    unsafe { execute_fn(ptr::null_mut(), log_config.as_ptr()) };

    // 注册 TDLib 数据目录到 asset protocol 作用域，使前端能加载图片等文件
    let tdlib_data_dir = state.data_dir.join("TDLib");
    std::fs::create_dir_all(&tdlib_data_dir)
        .map_err(|e| format!("Failed to create TDLib data directory: {}", e))?;
    let _ = app_handle
        .asset_protocol_scope()
        .allow_directory(tdlib_data_dir.clone(), true);

    let shared = Arc::new(TdLibShared {
        _lib: lib,
        create_fn,
        send_fn,
        receive_fn,
        execute_fn,
        destroy_fn,
    });

    let mut slot = state.tdlib_shared.lock().map_err(|e| e.to_string())?;
    *slot = Some(shared.clone());
    Ok(shared)
}

/// 为指定账户创建 TDLib 客户端并启动后台接收线程。
fn create_client(
    app_handle: &tauri::AppHandle,
    state: &AppState,
    session_id: i64,
) -> Result<(), String> {
    let sh = ensure_shared_loaded(app_handle, state)?;

    let db_dir = account_db_dir(&state.data_dir, session_id);
    let files_dir = account_files_dir(&state.data_dir, session_id);
    std::fs::create_dir_all(&db_dir)
        .map_err(|e| format!("Failed to create TDLib db directory: {e}"))?;
    std::fs::create_dir_all(&files_dir)
        .map_err(|e| format!("Failed to create TDLib files directory: {e}"))?;

    let client_ptr = unsafe { (sh.create_fn)() };
    if client_ptr.is_null() {
        return Err(
            "Failed to create TDLib client: td_json_client_create returned null".to_string(),
        );
    }

    // 应用代理配置（在授权开始前生效）
    let proxy_cfg = state
        .proxy_config
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    if proxy_cfg.mode != "disabled" {
        apply_proxy_to_client(sh.send_fn, client_ptr, &proxy_cfg);
    }

    let client = Arc::new(TdLibClient {
        id: session_id,
        client: client_ptr,
        destroy_fn: sh.destroy_fn,
        close_signal: Arc::new(Mutex::new(None)),
        chat_store: Arc::new(Mutex::new(ChatStore::new())),
        connection_state: Arc::new(Mutex::new(None)),
        options: Arc::new(Mutex::new(HashMap::new())),
        me: Mutex::new(None),
        my_id: Mutex::new(None),
        avatar_file_id: Mutex::new(None),
        avatar_path: Mutex::new(None),
        authorization_state: Mutex::new(None),
    });

    {
        let mut clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.insert(session_id, client.clone());
    }

    // 初始化运行时元数据
    {
        let mut meta = state.account_meta.lock().map_err(|e| e.to_string())?;
        meta.entry(session_id)
            .or_insert_with(|| AccountRuntimeMeta {
                logged_in: false,
                avatar_path: None,
            });
    }

    spawn_receive_loop(
        app_handle.clone(),
        Arc::new(state_snapshot(state)),
        session_id,
        client,
        sh,
        db_dir,
        files_dir,
    );
    Ok(())
}

/// 构造一个供接收线程使用的 AppState 快照（克隆跨线程共享的 Arc 句柄，
/// 其中 `active` 与主 AppState 共享同一个 AtomicI64，切换账户可实时生效）。
fn state_snapshot(state: &AppState) -> AppStateRef {
    AppStateRef {
        active: state.active.clone(),
        pending_requests: state.pending_requests.clone(),
        config: state.config.clone(),
        download_store: state.download_store.clone(),
        accounts: state.accounts.clone(),
        account_meta: state.account_meta.clone(),
    }
}

/// 接收线程所需的共享句柄（避免直接把整个 AppState 传进线程造成生命周期复杂化）。
struct AppStateRef {
    active: Arc<AtomicI64>,
    pending_requests: Arc<Mutex<HashMap<i64, oneshot::Sender<serde_json::Value>>>>,
    config: Arc<Mutex<TdLibConfig>>,
    download_store: Arc<Mutex<DownloadStore>>,
    accounts: Arc<Mutex<AccountsStore>>,
    account_meta: Arc<Mutex<HashMap<i64, AccountRuntimeMeta>>>,
}

/// 启动账户的后台接收线程。
fn spawn_receive_loop(
    app_handle: tauri::AppHandle,
    state: Arc<AppStateRef>,
    session_id: i64,
    client: Arc<TdLibClient>,
    sh: Arc<TdLibShared>,
    tdlib_db_dir: PathBuf,
    tdlib_files_dir: PathBuf,
) {
    let send_fn = sh.send_fn;
    let receive_fn = sh.receive_fn;
    let close_signal = client.close_signal.clone();
    let chat_store = client.chat_store.clone();
    let connection_state = client.connection_state.clone();
    let options = client.options.clone();

    std::thread::spawn(move || {
        loop {
            unsafe {
                let res_ptr = receive_fn(client.client, 1.0); // 1 秒超时
                if res_ptr.is_null() {
                    continue;
                }
                let c_str = CStr::from_ptr(res_ptr);
                let json_str = c_str.to_string_lossy().into_owned();

                let Ok(mut event) = serde_json::from_str::<serde_json::Value>(&json_str) else {
                    continue;
                };

                let is_active = state.active.load(Ordering::SeqCst) == session_id;

                // 资源释放完成（客户端已 close）：通知等待方并退出接收线程
                if event.get("@type").and_then(|v| v.as_str()) == Some("updateAuthorizationState") {
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
                            break;
                        }
                    }
                }

                #[cfg(debug_assertions)]
                if let Some(t) = event.get("@type").and_then(|v| v.as_str()) {
                    if t == "error" {
                        println!("[client:{}][tdlib-update] error: {}", client.id, json_str);
                    } else {
                        println!("[client:{}][tdlib-update] {}", client.id, t);
                    }
                }

                // 提取 @extra.request_id
                let mut request_id: Option<i64> = None;
                let mut internal_kind: Option<String> = None;
                if let Some(extra) = event.get("@extra") {
                    if let Some(id) = extra.get("request_id") {
                        if let Some(id_i64) = id.as_i64() {
                            request_id = Some(id_i64);
                        } else if let Some(id_str) = id.as_str() {
                            internal_kind = Some(id_str.to_string());
                        }
                    }
                }

                // internal setTdlibParameters 的错误上报
                if internal_kind.as_deref() == Some("internal-setTdlibParameters") {
                    if event.get("@type").and_then(|v| v.as_str()) == Some("error") {
                        let _ = app_handle.emit("tdlib-init-error", &event);
                    }
                }

                // 授权状态自动处理
                if let Some(type_field) = event.get("@type").and_then(|v| v.as_str()) {
                    if type_field == "updateAuthorizationState" {
                        if let Some(auth_state) = event.get("authorization_state") {
                            if let Some(state_type) =
                                auth_state.get("@type").and_then(|v| v.as_str())
                            {
                                // 记录授权态
                                if let Ok(mut a) = client.authorization_state.lock() {
                                    *a = Some(state_type.to_string());
                                }
                                let is_ready = state_type == "authorizationStateReady";
                                let is_closed_kind = state_type == "authorizationStateClosed"
                                    || state_type == "authorizationStateLoggingOut";

                                // 更新账户登录状态
                                {
                                    let logged_in = is_ready;
                                    if let Ok(mut meta) = state.account_meta.lock() {
                                        if let Some(m) = meta.get_mut(&session_id) {
                                            m.logged_in = logged_in;
                                        }
                                    }
                                }

                                if state_type == "authorizationStateWaitTdlibParameters" {
                                    // 优先使用该账户自身保存的凭据，fallback 到全局 config
                                    let (api_id, api_hash, use_test_dc) = {
                                        let accounts = state.accounts.lock().unwrap();
                                        if let Some(params) = accounts.get_tdlib_params(session_id)
                                        {
                                            params
                                        } else {
                                            let cfg = state.config.lock().unwrap();
                                            (cfg.api_id, cfg.api_hash.clone(), cfg.use_test_dc)
                                        }
                                    };
                                    let db_dir = tdlib_db_dir.to_string_lossy().to_string();
                                    let files_dir = tdlib_files_dir.to_string_lossy().to_string();
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
                                    let req_str = CString::new(request.to_string()).unwrap();
                                    send_fn(client.client, req_str.as_ptr());
                                } else if state_type == "authorizationStateReady" {
                                    // 拉取自己的信息（用于账户列表显示名称/头像）
                                    let request = json!({
                                        "@type": "getMe",
                                        "@extra": { "request_id": "internal-getMe" }
                                    });
                                    let req_str = CString::new(request.to_string()).unwrap();
                                    send_fn(client.client, req_str.as_ptr());
                                } else if is_ready || is_closed_kind {
                                    // 状态变化后推送账户列表更新
                                    emit_accounts_updated(&app_handle, &state);
                                }
                            }
                        }
                    }
                }

                // 将 @type 转换为 _ 发送给前端
                rename_json_key(&mut event, "@type", "_");

                // 缓存 updateConnectionState
                if event.get("_").and_then(|v| v.as_str()) == Some("updateConnectionState") {
                    if let Some(state_val) = event.get("state") {
                        if let Ok(state_json) = serde_json::to_string(state_val) {
                            if let Ok(mut cs) = connection_state.lock() {
                                *cs = Some(state_json);
                            }
                        }
                    }
                }

                // 缓存 updateOption
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

                // internal-getMe 响应：缓存自己的信息，更新账户列表与头像
                if internal_kind.as_deref() == Some("internal-getMe") {
                    handle_get_me(
                        &event,
                        session_id,
                        client.client,
                        send_fn,
                        &state,
                        &app_handle,
                        &client,
                    );
                    continue;
                }

                // 处理聊天缓存（updateChat...），仅活动账户转发衍生事件
                if let Some(events) = chat_store.lock().unwrap().handle_update(&event) {
                    if is_active {
                        for (event_name, payload) in events {
                            let _ = app_handle.emit(&event_name, &payload);
                        }
                    }
                }

                // 处理下载管理器的 updateFile 事件（全局下载任务）
                if event.get("_").and_then(|v| v.as_str()) == Some("updateFile") {
                    handle_update_file(&event, &state, &app_handle);
                }

                // 自己信息/头像变化时，更新账户列表
                if event.get("_").and_then(|v| v.as_str()) == Some("updateUser") {
                    if let Some(uid) = event
                        .get("user")
                        .and_then(|v| v.get("id"))
                        .and_then(|v| v.as_i64())
                    {
                        let my = client.my_id.lock().unwrap().clone();
                        if my == Some(uid) {
                            update_me_from_user(
                                &event,
                                session_id,
                                client.client,
                                send_fn,
                                &state,
                                &app_handle,
                                &client,
                            );
                        }
                    }
                }
                // 头像文件下载完成
                if event.get("_").and_then(|v| v.as_str()) == Some("updateFile") {
                    maybe_update_avatar(&event, &state, &app_handle, &client);
                }

                // 如果是请求响应，发送到对应的 channel（不再广播）
                if let Some(id) = request_id {
                    let mut map = state.pending_requests.lock().unwrap();
                    if let Some(sender) = map.remove(&id) {
                        if let serde_json::Value::Object(ref mut obj) = event {
                            obj.remove("@extra");
                        }
                        let _ = sender.send(event);
                        continue;
                    }
                }

                // 仅活动账户把事件广播到前端
                if is_active {
                    if let Err(e) = app_handle.emit("tdlib-update", &event) {
                        eprintln!("Failed to emit event: {}", e);
                    }
                }
            }
        }
    });
}

/// 处理 getMe 响应：缓存自己信息，更新持久化名称与头像下载。
fn handle_get_me(
    event: &serde_json::Value,
    session_id: i64,
    client_ptr: *mut c_void,
    send_fn: TdJsonClientSend,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    client: &Arc<TdLibClient>,
) {
    if event.get("_").and_then(|v| v.as_str()) != Some("user") {
        emit_accounts_updated(app_handle, state);
        return;
    }

    if let Ok(mut me) = client.me.lock() {
        *me = Some(event.clone());
    }
    if let Some(uid) = event.get("id").and_then(|v| v.as_i64()) {
        if let Ok(mut m) = client.my_id.lock() {
            *m = Some(uid);
        }
    }

    let first = event
        .get("first_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let last = event
        .get("last_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let username = extract_username(event);
    if let Ok(mut accounts) = state.accounts.lock() {
        accounts.update_profile(session_id, first, last, username);
    }

    // 触发头像下载
    let photo = event.get("profile_photo");
    if let Some(small) = photo.and_then(|p| p.get("small")) {
        if let Some(fid) = small.get("id").and_then(|v| v.as_i64()) {
            if let Ok(mut f) = client.avatar_file_id.lock() {
                *f = Some(fid as i32);
            }
            let has_path = small
                .pointer("/local/path")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            if has_path {
                if let Ok(mut ap) = client.avatar_path.lock() {
                    *ap = small
                        .pointer("/local/path")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    if let Ok(mut meta) = state.account_meta.lock() {
                        if let Some(m) = meta.get_mut(&session_id) {
                            m.avatar_path = small
                                .pointer("/local/path")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                    }
                }
            } else {
                let request = json!({
                    "@type": "downloadFile",
                    "file_id": fid,
                    "priority": 1,
                    "offset": 0,
                    "limit": 0,
                    "synchronous": false,
                });
                let req_str = CString::new(request.to_string()).unwrap();
                unsafe { send_fn(client_ptr, req_str.as_ptr()) };
            }
        }
    }

    emit_accounts_updated(app_handle, state);
}

/// 自己的 user 更新（updateUser 携带我的完整 user）时刷新缓存与账户列表。
fn update_me_from_user(
    event: &serde_json::Value,
    session_id: i64,
    client_ptr: *mut c_void,
    send_fn: TdJsonClientSend,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    client: &Arc<TdLibClient>,
) {
    let Some(user) = event.get("user") else {
        return;
    };
    if let Ok(mut me) = client.me.lock() {
        *me = Some(user.clone());
    }
    let first = user
        .get("first_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let last = user
        .get("last_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let username = extract_username(user);
    if let Ok(mut accounts) = state.accounts.lock() {
        accounts.update_profile(session_id, first, last, username);
    }

    // 头像变化后若有新的 small 文件则下载
    let photo = user.get("profile_photo");
    if let Some(small) = photo.and_then(|p| p.get("small")) {
        if let Some(fid) = small.get("id").and_then(|v| v.as_i64()) {
            let cur = client.avatar_file_id.lock().unwrap().clone();
            if cur != Some(fid as i32) {
                if let Ok(mut f) = client.avatar_file_id.lock() {
                    *f = Some(fid as i32);
                }
                let has_path = small
                    .pointer("/local/path")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_path {
                    let request = json!({
                        "@type": "downloadFile",
                        "file_id": fid,
                        "priority": 1,
                        "offset": 0,
                        "limit": 0,
                        "synchronous": false,
                    });
                    let req_str = CString::new(request.to_string()).unwrap();
                    unsafe { send_fn(client_ptr, req_str.as_ptr()) };
                }
            }
        }
    }

    emit_accounts_updated(app_handle, state);
}

/// 头像文件下载完成时更新 avatar_path。
fn maybe_update_avatar(
    event: &serde_json::Value,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    client: &Arc<TdLibClient>,
) {
    let Some(file) = event.get("file") else {
        return;
    };
    let Some(fid) = file.get("id").and_then(|v| v.as_i64()) else {
        return;
    };

    let Some(avatar_fid) = client.avatar_file_id.lock().unwrap().clone() else {
        return;
    };
    if fid as i32 != avatar_fid {
        return;
    }
    let completed = file
        .pointer("/local/is_downloading_completed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !completed {
        return;
    }
    if let Some(path) = file.pointer("/local/path").and_then(|v| v.as_str()) {
        let path_str = path.to_string();
        if let Ok(mut ap) = client.avatar_path.lock() {
            *ap = Some(path_str.clone());
        }
        if let Ok(mut meta) = state.account_meta.lock() {
            if let Some(m) = meta.get_mut(&client.id) {
                m.avatar_path = Some(path_str);
            }
        }
        emit_accounts_updated(app_handle, state);
    }
}

/// 从 user 对象提取用户名（优先 active_usernames[0]）。
fn extract_username(user: &serde_json::Value) -> String {
    user.get("usernames")
        .and_then(|u| u.get("active_usernames"))
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .or_else(|| user.get("username").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string()
}

/// 发出账户列表更新事件。
fn emit_accounts_updated(app_handle: &tauri::AppHandle, state: &AppStateRef) {
    let payload = build_accounts_payload_ref(state);
    let _ = app_handle.emit("accounts-updated", payload);
}

fn build_accounts_payload_ref(state: &AppStateRef) -> Vec<serde_json::Value> {
    let meta = state.account_meta.lock().unwrap();
    let accounts = state.accounts.lock().unwrap();
    let active = state.active.load(Ordering::SeqCst);
    accounts
        .records()
        .iter()
        .map(|rec| {
            let m = meta.get(&rec.id);
            json!({
                "id": rec.id,
                "first_name": rec.first_name,
                "last_name": rec.last_name,
                "username": rec.username,
                "logged_in": m.map(|x| x.logged_in).unwrap_or(false),
                "avatar_path": m.and_then(|x| x.avatar_path.clone()),
                "is_active": rec.id == active,
            })
        })
        .collect()
}

/// 处理 updateFile 的下载/上传进度（全局下载任务，不区分账户）。
fn handle_update_file(
    event: &serde_json::Value,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
) {
    let Some(file) = event.get("file") else {
        return;
    };
    let Some(file_id) = file.get("id").and_then(|v| v.as_i64()) else {
        return;
    };

    // 下载进度
    {
        let downloaded_size = file
            .pointer("/local/downloaded_size")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let total_size = file.get("size").and_then(|v| v.as_i64()).unwrap_or(0);
        let expected = file
            .get("expected_size")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let effective_total = if total_size > 0 { total_size } else { expected };
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

        let mut dl_store = state.download_store.lock().unwrap();
        dl_store.update_progress(
            file_id as i32,
            downloaded_size,
            effective_total,
            is_dl_active,
            is_dl_completed,
            local_path.clone(),
        );

        let item = dl_store.get_item(file_id as i32).unwrap_or_else(|| {
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
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0),
            }
        });
        let _ = app_handle.emit("download-progress-update", &item);
    }

    // 上传进度
    {
        let is_up_active = file
            .pointer("/remote/is_uploading_active")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if is_up_active {
            let uploaded_size = file
                .pointer("/remote/uploaded_size")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let total_size = file.get("size").and_then(|v| v.as_i64()).unwrap_or(0);
            let expected = file
                .get("expected_size")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let effective_total = if total_size > 0 { total_size } else { expected };
            let is_up_completed = effective_total > 0 && uploaded_size >= effective_total;
            let local_path = file
                .pointer("/local/path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let mut ul_store = state.download_store.lock().unwrap();
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
                .unwrap_or_else(|| (format!("文件 #{}", file_id), "other".to_string()));
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
                let _ = app_handle.emit("upload-progress-update", &item);
            }
        }
    }
}

// --- 初始化入口 ---

/// 初始化 TDLib：迁移旧数据（单账户 → 账户 0），并为所有已登记账户创建
/// 客户端实例（全部常驻，后台接收消息）。
#[tauri::command]
pub fn init_tdlib(app_handle: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        if !clients.is_empty() {
            return Ok(()); // 已初始化
        }
    }

    // 迁移旧单账户数据 → 账户 0
    migrate_legacy_data(state.inner())?;

    // 同步活动账户 id（accounts.json 中的 active 可能为旧的）
    let (active_id, ids) = {
        let accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        (accounts.active(), accounts.ids())
    };
    state.active.store(active_id, Ordering::SeqCst);

    for id in ids {
        if let Err(e) = create_client(&app_handle, state.inner(), id) {
            let _ = app_handle.emit("tdlib-init-error", json!({ "message": e }));
            return Err(e);
        }
    }

    Ok(())
}

/// 将旧版单账户数据目录（TDLib/tdlib_db、TDLib/tdlib_files）迁移到账户 0。
fn migrate_legacy_data(state: &AppState) -> Result<(), String> {
    let tdlib_dir = state.data_dir.join("TDLib");
    let legacy_db = tdlib_dir.join("tdlib_db");
    let legacy_files = tdlib_dir.join("tdlib_files");
    let accounts_dir = tdlib_dir.join("accounts");

    // 已有 accounts 数据则不迁移
    if accounts_dir.is_dir() {
        let has_any = std::fs::read_dir(&accounts_dir)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false);
        if has_any {
            return Ok(());
        }
    }

    if legacy_db.is_dir() {
        let dst = account_db_dir(&state.data_dir, 0);
        if !dst.exists() {
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&legacy_db, &dst).map_err(|e| format!("迁移数据库目录失败: {e}"))?;
        }
    }
    if legacy_files.is_dir() {
        let dst = account_files_dir(&state.data_dir, 0);
        if !dst.exists() {
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&legacy_files, &dst).map_err(|e| format!("迁移文件目录失败: {e}"))?;
        }
    }
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

    #[cfg(debug_assertions)]
    println!("Sending request to TDLib: {}", request);

    {
        let sh = shared(state)?;
        let client = active_client(state)?;
        let mut request = request;
        rename_json_key(&mut request, "_", "@type");

        let request_id = state.request_id_counter.fetch_add(1, Ordering::SeqCst);

        if let serde_json::Value::Object(ref mut map) = request {
            map.insert("@extra".to_string(), json!({ "request_id": request_id }));
        }

        {
            let mut map = state.pending_requests.lock().map_err(|e| e.to_string())?;
            map.insert(request_id, tx);
        }

        let request_str = request.to_string();
        let c_str = CString::new(request_str).map_err(|e| e.to_string())?;
        unsafe { (sh.send_fn)(client.client, c_str.as_ptr()) };
    }

    match rx.await {
        Ok(response) => Ok(response),
        Err(_) => Err("Failed to receive response from TDLib".into()),
    }
}

#[tauri::command]
pub fn get_chat_lists(state: State<AppState>) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let store = client.chat_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_all_chat_lists_value())
}

#[tauri::command]
pub fn get_chat_list(
    state: State<AppState>,
    list: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let store = client.chat_store.lock().map_err(|e| e.to_string())?;
    let list_key = ChatStore::get_list_key(&list).ok_or("Invalid chat list type")?;

    if let Some(list_state) = store.lists.get(&list_key) {
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

#[tauri::command]
pub fn get_uploads(
    state: State<AppState>,
) -> Result<Vec<crate::download_store::DownloadItem>, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_uploads())
}

#[tauri::command]
pub fn dismiss_upload(state: State<AppState>, file_id: i32) -> Result<(), String> {
    let mut store = state.download_store.lock().map_err(|e| e.to_string())?;
    store.dismiss_upload(file_id);
    Ok(())
}

// ==================== 连接状态缓存命令 ====================

#[tauri::command]
pub fn get_cached_connection_state(
    state: State<AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let client = active_client(state.inner())?;
    let cs = client.connection_state.lock().map_err(|e| e.to_string())?;
    match cs.as_ref() {
        Some(json_str) => {
            let v: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
            Ok(Some(v))
        }
        None => Ok(None),
    }
}

// ==================== Options 缓存命令 ====================

#[tauri::command]
pub fn get_cached_options(state: State<AppState>) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let opts = client.options.lock().map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for (name, value_json) in opts.iter() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(value_json) {
            map.insert(name.clone(), v);
        }
    }
    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
pub fn get_cached_option(
    state: State<AppState>,
    name: String,
) -> Result<Option<serde_json::Value>, String> {
    let client = active_client(state.inner())?;
    let opts = client.options.lock().map_err(|e| e.to_string())?;
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

fn read_windows_system_proxy() -> Option<(String, u16)> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let settings_path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
        let settings = hkcu.open_subkey(settings_path).ok()?;

        let proxy_enable: u32 = settings.get_value("ProxyEnable").unwrap_or(0);
        if proxy_enable != 1 {
            return None;
        }

        let proxy_server: String = settings.get_value("ProxyServer").ok()?;
        if proxy_server.trim().is_empty() {
            return None;
        }

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

fn emit_migration_progress(
    app: &tauri::AppHandle,
    percent: u32,
    stage: &str,
    message: impl std::fmt::Display,
) {
    let _ = app.emit(
        "data-migration-progress",
        json!({ "percent": percent, "stage": stage, "message": message.to_string() }),
    );
}

#[tauri::command]
pub fn get_data_location(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<serde_json::Value, String> {
    let mode = crate::data_loc::read_mode(&app);
    let current_dir = state.data_dir.clone();
    let appdata_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let portable_dir =
        crate::data_loc::resolve_data_dir(&app, crate::data_loc::DataMode::Portable)?;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;

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

fn move_data_tree(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    if dst.exists() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let bak = std::path::PathBuf::from(format!("{}.bak-{}", dst.to_string_lossy(), ts));
        std::fs::rename(dst, &bak)
            .map_err(|e| format!("备份目标目录失败 {}: {e}", dst.display()))?;
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目标父目录 {}: {e}", parent.display()))?;
    }
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) => copy_and_remove(src, dst)
            .map_err(|copy_err| format!("移动目录失败 {}: {e} / {copy_err}", src.display())),
    }
}

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
        return Ok(());
    }

    let target_dir = crate::data_loc::resolve_data_dir(&app, target_mode)?;

    emit_migration_progress(&app, 5, "prepare", "准备迁移…");

    emit_migration_progress(&app, 10, "close", "正在关闭所有账户的 TDLib，等待资源释放…");
    shutdown_all_clients(state.inner()).await?;

    emit_migration_progress(&app, 40, "released", "资源已释放，开始移动数据…");

    let src_dir = state.data_dir.clone();
    let mut failed = None::<String>;

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
        emit_migration_progress(&app, 95, "error", format!("迁移出错：{err}"));
        let _ = crate::data_loc::write_mode(&app, current_mode);
    } else {
        if let Err(e) = crate::data_loc::write_mode(&app, target_mode) {
            emit_migration_progress(&app, 95, "error", format!("保存配置失败：{e}"));
            let _ = crate::data_loc::write_mode(&app, current_mode);
        } else {
            emit_migration_progress(&app, 100, "done", "迁移完成，正在重启应用…");
        }
    }

    tokio::time::sleep(Duration::from_millis(800)).await;
    app.restart();
}
