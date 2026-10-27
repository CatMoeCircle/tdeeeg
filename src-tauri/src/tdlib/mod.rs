//! TDLib 集成：共享动态库、按账户的客户端实例、请求分发。
//!
//! 子模块分工（原单文件 tdlib.rs 拆分）：
//! - [`loader`]      动态库探测 / 加载（tdjson）
//! - [`lifecycle`]   客户端创建 / 关闭 / 重启 / 强制重建
//! - [`accounts`]    账户清单命令、init 入口、旧数据迁移
//! - [`proxy`]       代理配置与系统代理
//! - [`proxy_carrier`] Web 代理载体（proxyTypeWeb 的隐藏 webview 与桥对象）
//! - [`receive`]     每账户接收线程（update 分发）
//! - [`file_events`] updateFile / 官方下载列表 / 自己的资料与头像
//! - [`downloads`]   下载、上传面板命令
//! - [`data_dir`]    数据存储位置与迁移

mod accounts;
mod data_dir;
mod downloads;
mod file_events;
mod lifecycle;
mod loader;
mod proxy;
mod proxy_carrier;
mod receive;

// 只有 Tauri 命令向外暴露；辅助函数留在各子模块内。
// 用 glob 再导出：`#[tauri::command]` 会额外生成 `__cmd__*` 隐藏项，
// generate_handler! 需要它们在 `tdlib::` 路径下可见。
pub use accounts::*;
pub use data_dir::*;
pub use downloads::*;
pub use lifecycle::*;
pub use proxy::*;
/// 载体隐藏窗口的 label 前缀（lib.rs 注册窗口状态插件时用来排除它们）。
pub(crate) use proxy_carrier::WINDOW_LABEL_PREFIX;

use crate::store::accounts::AccountsStore;
use crate::store::chat_store::ChatStore;
use crate::store::community_store::CommunityStore;
use crate::db::Db;
use crate::store::download_store::DownloadStore;
use libloading::Library;
use serde_json::json;
use std::collections::HashMap;
use std::ffi::CString;
use std::os::raw::{c_char, c_double, c_void};
use std::path::PathBuf;
use std::ptr;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use tokio::sync::oneshot;

use proxy::ProxyConfig;

/// updateFile 进度合并窗口。起始值：普通进度最多延迟这么久下发一次；
/// 完成/暂停/取消/路径就绪等状态变化不受它影响，仍然立即下发。
/// 压力测试（大文件下载 + 多图相册 + 媒体查看器连切）后再定值。
pub(super) const FILE_GATE_WINDOW: Duration = Duration::from_millis(100);

/// 递归重命名 JSON 键（TDLib `@type` ↔ 前端 `_`）。
pub(super) fn rename_json_key(value: &mut serde_json::Value, old_key: &str, new_key: &str) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(v) = map.remove(old_key) {
                map.insert(new_key.to_string(), v);
            }
            for v in map.values_mut() {
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

pub struct TdLibConfig {
    pub api_id: i32,
    pub api_hash: String,
    pub use_test_dc: bool,
    /// 当前使用的 TDLib 语言包 ID（tdesktop 本地化目标下的包标识，如 en / zh-hans-raw）
    pub language_pack_id: String,
    /// TDLib 本地化目标，固定使用 tdesktop
    pub localization_target: String,
    /// 操作系统语言 IETF 标签（setTdlibParameters.system_language_code）
    pub system_language_code: String,
}

// --- TDLib 函数签名 ---
pub(super) type TdJsonClientCreate = unsafe extern "C" fn() -> *mut c_void;
pub(super) type TdJsonClientSend = unsafe extern "C" fn(client: *mut c_void, request: *const c_char);
pub(super) type TdJsonClientReceive =
    unsafe extern "C" fn(client: *mut c_void, timeout: c_double) -> *const c_char;
pub(super) type TdJsonClientExecute =
    unsafe extern "C" fn(client: *mut c_void, request: *const c_char) -> *const c_char;
pub(super) type TdJsonClientDestroy = unsafe extern "C" fn(client: *mut c_void);

/// 共享的动态库与函数符号（所有账户共用一份）。
pub struct TdLibShared {
    _lib: Library,
    pub(super) create_fn: TdJsonClientCreate,
    pub(super) send_fn: TdJsonClientSend,
    pub(super) receive_fn: TdJsonClientReceive,
    pub(super) destroy_fn: TdJsonClientDestroy,
}

/// 单个账户对应的 TDLib 客户端实例。
/// 每个账户拥有独立的 client、独立的事件循环线程、独立的本地缓存
/// （聊天缓存、连接状态、options、自己的 user 信息与头像）。
pub struct TdLibClient {
    pub(super) id: i64,
    pub(super) client: *mut c_void,
    pub(super) destroy_fn: TdJsonClientDestroy,
    pub(super) close_signal: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    pub(super) chat_store: Arc<Mutex<ChatStore>>,
    pub(super) community_store: Arc<Mutex<CommunityStore>>,
    pub(super) connection_state: Arc<Mutex<Option<serde_json::Value>>>,
    pub(super) options: Arc<Mutex<HashMap<String, serde_json::Value>>>,
    /// getMe 返回的 user 对象缓存
    pub(super) me: Mutex<Option<serde_json::Value>>,
    /// 自己的 user id（Options.MyId 的等价物，来自 getMe）
    pub(super) my_id: Mutex<Option<i64>>,
    /// 自己头像 small 文件的 file id（用于追踪头像下载完成）
    pub(super) avatar_file_id: Mutex<Option<i32>>,
    /// 已下载头像的本地路径
    pub(super) avatar_path: Mutex<Option<String>>,
    /// 最近一次授权态 @type
    pub(super) authorization_state: Mutex<Option<String>>,
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
    /// 本地 SQLite（下载记录 + AI 对话记录）
    pub db: Arc<Db>,
    /// 当前数据根目录（TDLib 数据 + 数据库都存放于其下）
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
        let db = Arc::new(
            Db::open(&data_dir).unwrap_or_else(|e| panic!("打开本地数据库失败: {e}")),
        );
        Self {
            tdlib_shared: Mutex::new(None),
            clients: Mutex::new(HashMap::new()),
            active: Arc::new(AtomicI64::new(active)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            request_id_counter: AtomicI64::new(1),
            config: Arc::new(Mutex::new(TdLibConfig {
                api_id: builtin_api_id(),
                api_hash: builtin_api_hash(),
                use_test_dc: false,
                language_pack_id: "en".into(),
                localization_target: "tdesktop".into(),
                system_language_code: "en".into(),
            })),
            proxy_config: Arc::new(Mutex::new(ProxyConfig::default())),
            download_store: Arc::new(Mutex::new(DownloadStore::new(db.clone(), active))),
            stream_locks: Mutex::new(HashMap::new()),
            db,
            data_dir,
            accounts: Arc::new(Mutex::new(accounts)),
            account_meta: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// 取共享动态库（若尚未加载返回 None）。
pub(super) fn shared(state: &AppState) -> Result<Arc<TdLibShared>, String> {
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

/// 账户的 TDLib 数据子目录（database / files）。
pub(super) fn account_root_dir(data_dir: &std::path::Path, id: i64) -> PathBuf {
    data_dir.join("TDLib").join("accounts").join(id.to_string())
}

pub(super) fn account_db_dir(data_dir: &std::path::Path, id: i64) -> PathBuf {
    account_root_dir(data_dir, id).join("tdlib_db")
}

pub(super) fn account_files_dir(data_dir: &std::path::Path, id: i64) -> PathBuf {
    account_root_dir(data_dir, id).join("tdlib_files")
}

pub(super) fn builtin_api_id() -> i32 {
    env!("TG_API_ID")
        .parse()
        .expect("TG_API_ID must be a number")
}

pub(super) fn builtin_api_hash() -> String {
    env!("TG_API_HASH").to_string()
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

        let c_str = CString::new(request.to_string()).map_err(|e| e.to_string())?;
        unsafe { (sh.send_fn)(client.client, c_str.as_ptr()) };
    }

    rx.await
        .map_err(|_| "Failed to receive response from TDLib".to_string())
}

/// 启动补种动态圆环：在 Rust 侧发 getCurrentState 并就地过滤，只回 updateChatActiveStories，
/// 不把全量 updates 过 IPC / 主线程解析。
// ponytail: 每次启动拉一次全量 getCurrentState 再过滤，TDLib 无按类型查询接口；ceiling 是后端仍需遍历全量。
#[tauri::command]
pub async fn get_story_seed_updates(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut resp = send_request(state.inner(), json!({ "_": "getCurrentState" })).await?;
    let updates = resp
        .get_mut("updates")
        .and_then(|v| v.as_array_mut())
        .ok_or("getCurrentState 返回无 updates")?;
    let mut out: Vec<serde_json::Value> = updates
        .iter_mut()
        .filter(|u| {
            let t = u.get("_").or_else(|| u.get("@type")).and_then(|v| v.as_str());
            t == Some("updateChatActiveStories") && u.get("active_stories").is_some()
        })
        .map(|u| u.take())
        .collect();
    for u in &mut out {
        rename_json_key(u, "@type", "_");
    }
    Ok(out)
}

// ==================== 聊天 / 社区缓存命令 ====================

#[tauri::command]
pub async fn get_chat_lists(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let store = client.chat_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_all_chat_lists_value())
}

#[tauri::command]
pub async fn get_chat_list(
    state: State<'_, AppState>,
    list: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let store = client.chat_store.lock().map_err(|e| e.to_string())?;
    let list_key = ChatStore::get_list_key(&list).ok_or("Invalid chat list type")?;

    let Some(list_state) = store.lists.get(&list_key) else {
        return Ok(json!({ "list_key": list_key, "chat_ids": [], "chats": [] }));
    };
    let chats: Vec<_> = list_state
        .chat_ids
        .iter()
        .filter_map(|id| store.chats.get(id).cloned())
        .collect();
    Ok(json!({
        "list_key": list_key,
        "chat_ids": list_state.chat_ids,
        "chats": chats
    }))
}

#[tauri::command]
pub fn get_community(state: State<AppState>, community_id: i64) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let store = client.community_store.lock().map_err(|e| e.to_string())?;
    let community = store.get_community(community_id).ok_or("Community not found")?;
    serde_json::to_value(community).map_err(|e| e.to_string())
}

// ==================== 接收线程缓存的读命令 ====================

#[tauri::command]
pub fn get_cached_connection_state(
    state: State<AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let client = active_client(state.inner())?;
    let cs = client.connection_state.lock().map_err(|e| e.to_string())?;
    Ok(cs.clone())
}

#[tauri::command]
pub async fn get_cached_options(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = active_client(state.inner())?;
    let opts = client.options.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Object(
        opts.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
    ))
}

#[tauri::command]
pub fn get_cached_option(
    state: State<AppState>,
    name: String,
) -> Result<Option<serde_json::Value>, String> {
    let client = active_client(state.inner())?;
    let opts = client.options.lock().map_err(|e| e.to_string())?;
    Ok(opts.get(&name).cloned())
}
