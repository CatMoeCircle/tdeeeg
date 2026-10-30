//! 每账户接收线程：阻塞读 TDLib、分发 update。
//!
//! 线程模型（每个账户两个线程，TDLib 客户端无法共享接收线程）：
//! - 本文件的主接收循环：`td_json_client_receive` 是阻塞阻塞调用，必须按 client 独占；
//!   updateFile 之外的所有 update 在这里分发。
//! - `file_events` 用的 worker 线程：updateFile 高频，转发出去做状态更新 + 合并下发，
//!   避免拖慢主更新管道。

use super::file_events::{
    emit_accounts_updated, flush_download_list_updates, handle_download_list_update,
    handle_get_me, handle_update_file, maybe_update_avatar, slim_update_file, to_progress_value,
    update_me_from_user,
};
use super::{
    proxy_carrier, rename_json_key, TdJsonClientSend, TdLibClient, TdLibConfig, TdLibShared,
    FILE_GATE_WINDOW,
};
use crate::store::accounts::AccountsStore;
use crate::system::device_info;
use crate::store::download_store::DownloadStore;
use crate::updates::derived::DerivedBuffer;
use crate::updates::file_gate::{FileGate, Verdict, RAW_CHANNEL};
use crate::updates::update_manager::{classify, UpdateManager};
use serde_json::json;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::sync::oneshot;

/// 接收线程所需的共享句柄（避免直接把整个 AppState 传进线程造成生命周期复杂化）。
pub(super) struct AppStateRef {
    pub active: Arc<AtomicI64>,
    pub pending_requests: Arc<Mutex<HashMap<i64, oneshot::Sender<serde_json::Value>>>>,
    pub config: Arc<Mutex<TdLibConfig>>,
    pub download_store: Arc<Mutex<DownloadStore>>,
    pub accounts: Arc<Mutex<AccountsStore>>,
    pub account_meta: Arc<Mutex<HashMap<i64, super::AccountRuntimeMeta>>>,
}

/// 克隆跨线程共享的 Arc 句柄；`active` 与主 AppState 共享同一个 AtomicI64，
/// 切换账户可实时生效。
pub(super) fn state_snapshot(state: &super::AppState) -> AppStateRef {
    AppStateRef {
        active: state.active.clone(),
        pending_requests: state.pending_requests.clone(),
        config: state.config.clone(),
        download_store: state.download_store.clone(),
        accounts: state.accounts.clone(),
        account_meta: state.account_meta.clone(),
    }
}

/// 启动账户的后台接收线程。
/// `updateFile` 会从主接收循环转发到独立 worker 线程，并以独立 IPC（`tdlib-update-file`）推给前端，
/// 避免高频下载/上传进度拖慢主更新管道。
pub(super) fn spawn_receive_loop(
    app_handle: tauri::AppHandle,
    state: Arc<AppStateRef>,
    session_id: i64,
    client: Arc<TdLibClient>,
    sh: Arc<TdLibShared>,
    tdlib_db_dir: std::path::PathBuf,
    tdlib_files_dir: std::path::PathBuf,
) {
    let send_fn = sh.send_fn;
    let receive_fn = sh.receive_fn;
    let close_signal = client.close_signal.clone();
    let chat_store = client.chat_store.clone();
    let community_store = client.community_store.clone();
    let connection_state = client.connection_state.clone();
    let options = client.options.clone();

    // UpdateManager：分类 + 批处理，收敛为少量 Tauri 事件（仅活动账户入队）
    let update_mgr = Arc::new(UpdateManager::new());

    // 官方下载列表变更（addFileToDownloads / 暂停 / 移除）的合并缓冲：
    // 与 FileGate 同窗口、同批格式，避免批量下载时每文件各发一条事件。
    let mut list_gate = FileGate::new(FILE_GATE_WINDOW);

    // 派生 chat/community 事件合窗：同窗口同 key 只下发最新一份（仅活动账户入队）
    let mut derived = DerivedBuffer::new();

    // updateFile 专用通道 + 处理线程（下载/上传 store 更新、头像路径、独立 IPC）
    //
    // 内存状态逐条更新（下载/上传 store、头像、chat 缓存），只有**下发**过闸门：
    // 里程碑立即推、纯进度按 FILE_GATE_WINDOW 合并成最新一条、无变化直接丢。
    let (file_tx, file_rx) = mpsc::channel::<serde_json::Value>();
    {
        let app_handle = app_handle.clone();
        let state = Arc::clone(&state);
        let client = Arc::clone(&client);
        std::thread::Builder::new()
            .name(format!("{RAW_CHANNEL}-{session_id}"))
            .spawn(move || {
                let mut gate = FileGate::new(FILE_GATE_WINDOW);
                loop {
                    let event = match file_rx.recv_timeout(gate.poll()) {
                        Ok(event) => event,
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            flush_gate(&app_handle, &state, session_id, &mut gate);
                            continue;
                        }
                        // 发送端被 drop（接收循环因 closed 退出）→ 本线程结束
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    };
                    // 进度写入发起下载的账户独立 store；仅活动账户推前端事件
                    let progresses = handle_update_file(&event, &state, session_id);
                    maybe_update_avatar(&event, &state, &app_handle, &client);
                    // 只回写 Rust chat 缓存（photo.small/big.local），供下次 get_chat_list 等拉取。
                    // 不 emit chat-update：前端已自行处理头像上屏，避免双源覆盖/闪烁。
                    client.chat_store.lock().unwrap().apply_file_update(&event);
                    if state.active.load(Ordering::SeqCst) != session_id {
                        continue;
                    }
                    let null = serde_json::Value::Null;
                    let file = event.get("file").unwrap_or(&null);
                    let file_id = file.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                    let mut milestone = false;
                    for mut progress in progresses {
                        let channel = if progress.is_upload {
                            "upload-progress-update"
                        } else {
                            "download-progress-update"
                        };
                        // 进度事件一律不带 base64 缩略图：前端已改用本地本体 / 源消息封面
                        // （src/utils/downloadThumb.ts），这里剥离后序列化一次即可。
                        progress.item.thumbnail_data_url = None;
                        let payload = to_progress_value(&progress.item);
                        match gate.submit(file_id, file, channel, payload) {
                            Verdict::Now => {
                                milestone = true;
                                let _ = app_handle.emit(channel, &progress.item);
                            }
                            // 进合并缓冲，窗口到期统一下发最新一条
                            Verdict::Later => {}
                            // 与已下发状态一致，丢弃
                            Verdict::Drop => {}
                        }
                    }
                    // 里程碑（开始/暂停/完成/路径就绪/上传状态变化）才推原始事件：
                    // 壁纸页与消息快照按 file.id 匹配，纯进度 tick 对它们没有意义。
                    if milestone {
                        gate.push_raw(slim_update_file(event));
                    }
                    flush_gate(&app_handle, &state, session_id, &mut gate);
                }
            })
            .expect("failed to spawn tdlib updateFile worker thread");
    }

    std::thread::spawn(move || loop {
        // 50ms 超时：与 UpdateManager 批处理窗口对齐，保证低流量时
        // 单条 update 也不会在缓冲里挂满 1 秒才下发
        let res_ptr = unsafe { receive_fn(client.client, 0.05) };
        if res_ptr.is_null() {
            // 空闲时也冲刷到期批次，避免低流量场景下批一直挂着
            update_mgr.flush_due(&app_handle);
            flush_download_list_updates(&app_handle, &mut list_gate);
            // 派生事件同样要在这里冲：下面 continue 会跳过循环尾部的 flush_derived，
            // 漏了这句则一批 chat-list-update 会挂到下一条 update 到达才发出（会话列表排序迟滞）
            flush_derived(&app_handle, &state, session_id, &mut derived);
            continue;
        }
        let json_str = unsafe { CStr::from_ptr(res_ptr) }
            .to_string_lossy()
            .into_owned();
        let Ok(mut event) = serde_json::from_str::<serde_json::Value>(&json_str) else {
            continue;
        };

        // 只打 update 类型名（error 才打全文）：完整 JSON 每条几百字节会把日志刷爆
        #[cfg(debug_assertions)]
        if let Some(t) = event.get("@type").and_then(|v| v.as_str()) {
            if t == "error" {
                println!("[client:{}][tdlib-update] error: {}", client.id, json_str);
            } else {
                println!("[client:{}][tdlib-update] {}", client.id, t);
            }
        }

        let is_active = state.active.load(Ordering::SeqCst) == session_id;

        // @extra.request_id：数字 = 请求响应；字符串 = 内部请求（如 internal-getMe）
        let raw_id = event.get("@extra").and_then(|e| e.get("request_id"));
        let request_id = raw_id.and_then(|v| v.as_i64());
        let internal_kind = raw_id.and_then(|v| v.as_str()).map(String::from);

        // internal setTdlibParameters 的错误上报
        if internal_kind.as_deref() == Some("internal-setTdlibParameters")
            && event.get("@type").and_then(|v| v.as_str()) == Some("error")
        {
            let _ = app_handle.emit("tdlib-init-error", &event);
        }

        // 授权状态自动处理；Closed 时释放等待方并退出接收线程
        if event.get("@type").and_then(|v| v.as_str()) == Some("updateAuthorizationState") {
            let auth_kind = event
                .get("authorization_state")
                .and_then(|s| s.get("@type"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if auth_kind == "authorizationStateClosed" {
                if let Ok(mut sig) = close_signal.lock() {
                    if let Some(tx) = sig.take() {
                        let _ = tx.send(());
                    }
                }
                // 让仍在 await 的 tdlib_send 立即失败，避免前端 logOut 等请求永久挂起
                if let Ok(mut map) = state.pending_requests.lock() {
                    for (_, tx) in map.drain() {
                        let _ = tx.send(json!({
                            "_": "error",
                            "code": 500,
                            "message": "TDLib client closed"
                        }));
                    }
                }
                // 客户端已关闭：它名下还挂着的 Web 代理载体没有意义了
                proxy_carrier::close_session(&app_handle, session_id);
                break;
            }
            on_authorization_state(
                auth_kind,
                session_id,
                send_fn,
                &state,
                &app_handle,
                &client,
                &tdlib_db_dir,
                &tdlib_files_dir,
            );
        }

        // 将 @type 转换为 _ 发送给前端
        rename_json_key(&mut event, "@type", "_");

        // TDLib 官方下载列表状态（用户手动下载 addFileToDownloads / pause / remove）
        // 这些更新低频，但必须同步本地 downloads store：否则取消后仍会在重启后续传。
        if matches!(
            event.get("_").and_then(|v| v.as_str()),
            Some("updateFileDownload")
                | Some("updateFileAddedToDownloads")
                | Some("updateFileRemovedFromDownloads")
                | Some("updateFileDownloads")
        ) {
            handle_download_list_update(
                &event,
                &state,
                &app_handle,
                &mut list_gate,
                session_id,
            );
        }

        // updateFile 高频事件：转发到专用线程处理并走独立 IPC，
        // 不进入主更新管道（不缓存 chat、不广播 tdlib-update）。
        if event.get("_").and_then(|v| v.as_str()) == Some("updateFile") {
            let _ = file_tx.send(event);
            continue;
        }

        // Web 代理载体（TDLib 1.8.69 的 proxyTypeWeb）：隐藏 webview + 桥对象的
        // 打开/投递/关闭全部由 Rust 侧独占处理，前端不需要也不应该看到这些 update。
        if matches!(
            event.get("_").and_then(|v| v.as_str()),
            Some("updateWebProxyCarrierOpened")
                | Some("updateWebProxyCarrierData")
                | Some("updateWebProxyCarrierClosed")
        ) {
            proxy_carrier::handle_update(&app_handle, session_id, &event);
            continue;
        }

        // Mini App：updateWebAppMessageSent 表示 app 已把数据发到聊天，Rust 侧
        // 按 launch_id 关掉对应 webview 并回执 closeWebApp，前端不需要看到它。
        if event.get("_").and_then(|v| v.as_str()) == Some("updateWebAppMessageSent") {
            super::miniapp::handle_update(&app_handle, session_id, &event);
            continue;
        }

        match event.get("_").and_then(|v| v.as_str()).unwrap_or("") {
            // 缓存 updateConnectionState
            "updateConnectionState" => {
                if let Some(state_val) = event.get("state") {
                    if let Ok(mut cs) = connection_state.lock() {
                        *cs = Some(state_val.clone());
                    }
                }
            }
            // 缓存 updateOption
            "updateOption" => {
                if let (Some(name), Some(value)) =
                    (event.get("name").and_then(|v| v.as_str()), event.get("value"))
                {
                    if let Ok(mut opts) = options.lock() {
                        opts.insert(name.to_string(), value.clone());
                    }
                }
            }
            _ => {}
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

        // 处理聊天 / 社区缓存（只转发活动账户的衍生事件）
        // 注意：先取结果再放锁，emit 期间不持有缓存锁（否则阻塞 get_chat_list）
        // 非活动账户：派生事件不进缓冲、不下发（保持原 is_active 语义）；
        // 活动账户：进合窗缓冲，由下方 flush_derived 在窗口到期时每 key 下发一次
        //
        // 【双发是设计，不是重复，别删】同一条 update 走两条路下发给前端：
        //   ① 派生事件（chat-update / chat-list-update，本处）—— 整对象快照与列表排序的权威来源；
        //      列表顺序只有 Rust 的 ChatListState 有，前端无法自行派生。
        //   ② 原始 update 批（循环尾部的 update_mgr）—— 增量字段的权威来源。
        //      派生用的 Chat 结构（store/chat_store.rs）是有损投影，缺 background / is_translatable /
        //      message_sender_id / last_read_outbox_message_id / business_bot_manage_bar /
        //      has_protected_content；updateChatActiveStories 更是只有原始通道才有。
        //      删任一条都会静默丢数据（vue-tsc / cargo check 都抓不到）。两条都已按 ~50ms 窗口合窗，代价可控。
        let chat_events = chat_store.lock().unwrap().handle_update(&event);
        if is_active {
            for (event_name, payload) in chat_events.into_iter().flatten() {
                derived.push(event_name, payload);
            }
        }
        let community_events = community_store.lock().unwrap().handle_update(&event);
        if is_active {
            for (event_name, payload) in community_events.into_iter().flatten() {
                derived.push(event_name, payload);
            }
        }

        // 系统通知：在 Rust 侧处理 updateNotificationGroup / 连接态 / 用户缓存
        if let Some(svc) = app_handle.try_state::<crate::system::notifications::NotificationService>() {
            crate::system::notifications::handle_update(
                svc.inner(),
                &event,
                &chat_store,
                &app_handle,
                is_active,
            );
        }

        // 自己信息/头像变化时，更新账户列表
        if event.get("_").and_then(|v| v.as_str()) == Some("updateUser") {
            let uid = event
                .get("user")
                .and_then(|v| v.get("id"))
                .and_then(|v| v.as_i64());
            if uid.is_some() && uid == *client.my_id.lock().unwrap() {
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

        // 如果是请求响应，发送到对应的 channel（不再广播）
        if let Some(id) = request_id {
            let sender = state.pending_requests.lock().unwrap().remove(&id);
            if let Some(sender) = sender {
                if let serde_json::Value::Object(ref mut obj) = event {
                    obj.remove("@extra");
                }
                let _ = sender.send(event);
                // 响应也可能让批处理到期，顺带冲刷
                update_mgr.flush_due(&app_handle);
                flush_download_list_updates(&app_handle, &mut list_gate);
                flush_derived(&app_handle, &state, session_id, &mut derived);
                continue;
            }
        }

        // 仅活动账户：分类入队，由 UpdateManager 批处理/立即下发
        // 替代原先「每条 update 都 emit("tdlib-update")」导致的
        // N 个前端 listener × 全量反序列化 × if 过滤
        if is_active {
            let type_name = event.get("_").and_then(|v| v.as_str()).unwrap_or("");
            let category = classify(type_name);
            update_mgr.push(&app_handle, category, event);
        }

        // 每轮接收后冲刷到期批次（约 50ms 窗口）
        update_mgr.flush_due(&app_handle);
        flush_download_list_updates(&app_handle, &mut list_gate);
        flush_derived(&app_handle, &state, session_id, &mut derived);
    });
}

/// 冲刷派生事件合窗缓冲：窗口到期才取出；非活动账户直接丢弃，不下发。
fn flush_derived(
    app_handle: &tauri::AppHandle,
    state: &AppStateRef,
    session_id: i64,
    derived: &mut DerivedBuffer,
) {
    let due = derived.take_due();
    if state.active.load(Ordering::SeqCst) != session_id {
        return;
    }
    for (event_name, payload) in due {
        let _ = app_handle.emit(&event_name, payload);
    }
}

/// 冲刷 worker 侧的合并缓冲：总是清空，只对活动账户下发。
fn flush_gate(
    app_handle: &tauri::AppHandle,
    state: &AppStateRef,
    session_id: i64,
    gate: &mut FileGate,
) {
    let due = gate.take_due();
    if state.active.load(Ordering::SeqCst) != session_id {
        return;
    }
    for batch in due {
        // 一个通道一个批次一条事件，前端按 { updates: [...] } 拆回逐条
        let _ = app_handle.emit(batch.channel, json!({ "updates": batch.payloads }));
    }
}

/// 授权态变化：记录状态、更新登录标记，并在关键节点驱动 setTdlibParameters / getMe。
fn on_authorization_state(
    kind: &str,
    session_id: i64,
    send_fn: TdJsonClientSend,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    client: &Arc<TdLibClient>,
    db_dir: &Path,
    files_dir: &Path,
) {
    if let Ok(mut a) = client.authorization_state.lock() {
        *a = Some(kind.to_string());
    }
    if let Ok(mut meta) = state.account_meta.lock() {
        if let Some(m) = meta.get_mut(&session_id) {
            m.logged_in = kind == "authorizationStateReady";
        }
    }

    match kind {
        "authorizationStateWaitTdlibParameters" => {
            // 凭据优先级（必须与「用户已配置自定义 API」保持一致）：
            // 1) 账户记录中的自定义 api_id/api_hash（persist 写入）
            // 2) 全局 config（bootstrap / set_tdlib_parameters 写入，含 settings.system）
            // 3) 编译期内置凭据（config 默认值）
            let (api_id, api_hash, use_test_dc, language_pack_id, localization_target, system_language_code) = {
                let cfg = state.config.lock().unwrap();
                let accounts = state.accounts.lock().unwrap();
                let (acct_id, acct_hash, test_dc) = accounts
                    .get_tdlib_params(session_id)
                    .unwrap_or((None, None, None));
                (
                    acct_id.unwrap_or(cfg.api_id),
                    acct_hash.unwrap_or_else(|| cfg.api_hash.clone()),
                    test_dc.unwrap_or(cfg.use_test_dc),
                    cfg.language_pack_id.clone(),
                    cfg.localization_target.clone(),
                    cfg.system_language_code.clone(),
                )
            };
            let request = json!({
                "@type": "setTdlibParameters",
                "use_test_dc": use_test_dc,
                "database_directory": db_dir.to_string_lossy(),
                "files_directory": files_dir.to_string_lossy(),
                "use_file_database": true,
                "use_chat_info_database": true,
                "use_message_database": true,
                "use_secret_chats": true,
                "api_id": api_id,
                "api_hash": api_hash,
                "system_language_code": system_language_code,
                "device_model": device_info::device_model(),
                "system_version": device_info::system_version(),
                "application_version": env!("CARGO_PKG_VERSION"),
                "enable_storage_optimizer": true,
                "@extra": { "request_id": "internal-setTdlibParameters" }
            });
            send_json(send_fn, client.client, &request);
            // 本地化目标与语言包在 setTdlibParameters 之外以 option 形式设置。
            // localization_target 固定/默认 tdesktop；language_pack_id 决定 Telegram 官方语言包。
            for (name, value) in [
                ("localization_target", localization_target),
                ("language_pack_id", language_pack_id),
            ] {
                send_json(
                    send_fn,
                    client.client,
                    &json!({
                        "@type": "setOption",
                        "name": name,
                        "value": { "@type": "optionValueString", "value": value }
                    }),
                );
            }
        }
        "authorizationStateReady" => {
            // 拉取自己的信息（用于账户列表显示名称/头像）
            send_json(
                send_fn,
                client.client,
                &json!({ "@type": "getMe", "@extra": { "request_id": "internal-getMe" } }),
            );
        }
        "authorizationStateLoggingOut" | "authorizationStateClosed" => {
            // 状态变化后推送账户列表更新
            emit_accounts_updated(app_handle, state);
        }
        _ => {}
    }
}

/// 发送一条 JSON 请求到 TDLib（内部请求，不走 pending_requests）。
pub(super) fn send_json(
    send_fn: TdJsonClientSend,
    client: *mut std::os::raw::c_void,
    req: &serde_json::Value,
) {
    let Ok(c_str) = CString::new(req.to_string()) else {
        return;
    };
    unsafe { send_fn(client, c_str.as_ptr()) };
}
