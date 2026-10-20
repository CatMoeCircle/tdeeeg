//! TDLib 文件相关事件：updateFile（下载/上传进度）、官方下载列表、自己的资料与头像。
//!
//! 这里的所有函数都在接收线程 / updateFile worker 线程里跑，只做内存状态更新，
//! 下发由调用方经 `FileGate` 合并后 emit。

use super::receive::{send_json, AppStateRef};
use super::accounts::accounts_payload;
use super::{TdJsonClientSend, TdLibClient};
use crate::store::download_store::{derive_item_key, DownloadItem};
use crate::updates::file_gate::FileGate;
use serde_json::json;
use std::os::raw::c_void;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{Emitter, Manager};

fn flag(file: &serde_json::Value, pointer: &str) -> bool {
    file.pointer(pointer)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn number(file: &serde_json::Value, pointer: &str) -> i64 {
    file.pointer(pointer).and_then(|v| v.as_i64()).unwrap_or(0)
}

fn text(file: &serde_json::Value, pointer: &str) -> Option<String> {
    file.pointer(pointer).and_then(|v| v.as_str()).map(str::to_string)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 文件名（不含目录）。
fn file_name_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string()
}

/// `size` 缺失时退到 `expected_size`。
fn effective_total(file: &serde_json::Value) -> i64 {
    let size = number(file, "/size");
    if size > 0 {
        size
    } else {
        number(file, "/expected_size")
    }
}

/// 进度条目 → 事件载荷（序列化失败时退化为空对象，不让一条脏数据拖垮整批）
pub(super) fn to_progress_value(item: &DownloadItem) -> serde_json::Value {
    serde_json::to_value(item).unwrap_or(serde_json::Value::Null)
}

/// 发出账户列表更新事件。
pub(super) fn emit_accounts_updated(app_handle: &tauri::AppHandle, state: &AppStateRef) {
    let meta = state.account_meta.lock().unwrap();
    let accounts = state.accounts.lock().unwrap();
    let payload = accounts_payload(&accounts, &meta, state.active.load(Ordering::SeqCst));
    let _ = app_handle.emit("accounts-updated", payload);
}

/// 一条待下发的进度载荷（下载/上传共用）。
pub(super) struct FileProgress {
    pub is_upload: bool,
    pub item: DownloadItem,
}

/// 处理 updateFile 的下载/上传进度：**只更新内存，不下发**。
/// `session_id`：发起该文件操作的 TDLib 账户；数据写入该账户独立的 store。
/// 后台账户静默记账（返回空 Vec），只有活动账户才把进度快照交给 `FileGate` 决定下发。
pub(super) fn handle_update_file(
    event: &serde_json::Value,
    state: &AppStateRef,
    session_id: i64,
) -> Vec<FileProgress> {
    let mut out = Vec::new();
    let Some(file) = event.get("file") else {
        return out;
    };
    let Some(file_id) = file.get("id").and_then(|v| v.as_i64()) else {
        return out;
    };
    let file_id = file_id as i32;
    let remote_id = text(file, "/remote/id");
    // unique_id 不含 file_reference，同一文件恒定：下载管理器以它为去重主键
    let unique_id = text(file, "/remote/unique_id").filter(|s| !s.is_empty());
    let is_active_account = state.active.load(Ordering::SeqCst) == session_id;
    let item_key = derive_item_key(unique_id.as_deref(), remote_id.as_deref(), file_id);
    let total = effective_total(file);
    let local_path = text(file, "/local/path");

    let mut store = state.download_store.lock().unwrap();

    // 下载进度
    let downloaded_size = number(file, "/local/downloaded_size");
    let dl_active = flag(file, "/local/is_downloading_active");
    let dl_done = flag(file, "/local/is_downloading_completed");
    let store_key = store.bind_session_key(
        session_id,
        file_id,
        unique_id.as_deref(),
        remote_id.as_deref(),
    );
    store.update_progress(
        Some(session_id),
        &store_key,
        downloaded_size,
        total,
        dl_active,
        dl_done,
        local_path.clone(),
    );
    if is_active_account {
        // 进度先于 register 到达时补一条（TDLib 只保证 updateFile，不保证顺序）
        let item = store
            .get_item_for(session_id, &store_key)
            .unwrap_or_else(|| DownloadItem {
                remote_id: item_key.clone(),
                session_file_id: Some(file_id),
                file_id,
                file_name: local_path.as_deref().map(file_name_of).unwrap_or_default(),
                total_size: total,
                downloaded_size,
                progress: if total > 0 {
                    downloaded_size as f64 / total as f64
                } else {
                    0.0
                },
                is_paused: !dl_active && !dl_done,
                is_completed: dl_done,
                local_path: local_path.clone(),
                file_type: "other".into(),
                is_generic: true,
                created_at: now_ms(),
                completed_at: if dl_done { now_ms() } else { 0 },
                has_tdlib_update: true,
                ..Default::default()
            });
        out.push(FileProgress {
            is_upload: false,
            item,
        });
    }

    // 上传进度（同样按账户隔离；仅活动账户推送前端）
    if is_active_account && flag(file, "/remote/is_uploading_active") {
        let uploaded_size = number(file, "/remote/uploaded_size");
        let (name, file_type) = local_path
            .as_deref()
            .map(|s| (file_name_of(s), infer_upload_type(s)))
            .unwrap_or_else(|| (format!("文件 #{file_id}"), "other".to_string()));
        store.register_upload(
            Some(session_id),
            Some(item_key.clone()),
            file_id,
            name,
            file_type,
            String::new(),
            total,
            None,
            local_path,
        );
        if let Some(item) = store.update_upload_progress(
            Some(session_id),
            &item_key,
            uploaded_size,
            total,
            true,
            total > 0 && uploaded_size >= total,
        ) {
            out.push(FileProgress {
                is_upload: true,
                item,
            });
        }
    }

    out
}

/// 根据本地文件扩展名推断上传任务的展示类型（与前端 DownloadFileType 对应）。
fn infer_upload_type(path: &str) -> String {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
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

/// 下发给前端的 `updateFile` 瘦身：去掉 `file.remote.id`。
///
/// `remote.id` 是把 `file_reference` base64 编码后的整串，既占体积又会随消息/上下文
/// 刷新而变。前端拿到 updateFile 只按 `file.id` 匹配、只读 `local`（完成态/路径），
/// 稳定身份用 `remote.unique_id`（本函数保留），从不自己拼 `inputFileRemote`。
pub(super) fn slim_update_file(mut event: serde_json::Value) -> serde_json::Value {
    if let Some(remote) = event
        .get_mut("file")
        .and_then(|f| f.get_mut("remote"))
        .and_then(|r| r.as_object_mut())
    {
        remote.remove("id");
    }
    event
}

// ==================== 自己的资料 / 头像 ====================

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

/// 缓存自己的 user、刷新持久化资料，并按需下载头像（getMe / updateUser 共用）。
fn apply_me(
    user: &serde_json::Value,
    session_id: i64,
    send_fn: TdJsonClientSend,
    client_ptr: *mut c_void,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    client: &Arc<TdLibClient>,
) {
    *client.me.lock().unwrap() = Some(user.clone());
    if let Some(uid) = user.get("id").and_then(|v| v.as_i64()) {
        *client.my_id.lock().unwrap() = Some(uid);
    }
    let text_of = |key: &str| {
        user.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    if let Ok(mut accounts) = state.accounts.lock() {
        accounts.update_profile(
            session_id,
            text_of("first_name"),
            text_of("last_name"),
            extract_username(user),
        );
    }

    if let Some(fid) = user
        .pointer("/profile_photo/small/id")
        .and_then(|v| v.as_i64())
    {
        let fid = fid as i32;
        *client.avatar_file_id.lock().unwrap() = Some(fid);
        let path = text(user, "/profile_photo/small/local/path").filter(|p| !p.is_empty());
        if let Some(path) = path {
            // 已是本地文件：直接记路径
            *client.avatar_path.lock().unwrap() = Some(path.clone());
            if let Ok(mut meta) = state.account_meta.lock() {
                if let Some(m) = meta.get_mut(&session_id) {
                    m.avatar_path = Some(path);
                }
            }
        } else {
            // 还没下载：请求一次
            send_json(
                send_fn,
                client_ptr,
                &json!({
                    "@type": "downloadFile",
                    "file_id": fid,
                    "priority": 1,
                    "offset": 0,
                    "limit": 0,
                    "synchronous": false,
                }),
            );
        }
    }

    emit_accounts_updated(app_handle, state);
}

/// 处理 getMe 响应：缓存自己信息，更新持久化名称与头像下载。
pub(super) fn handle_get_me(
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

    // 通知服务缓存自己的 id / 资料（私聊标题「发送者 → 自己」）
    if let Some(uid) = event.get("id").and_then(|v| v.as_i64()) {
        if let Some(svc) = app_handle.try_state::<crate::system::notifications::NotificationService>() {
            svc.set_my_id(uid);
            // handle_update 的 cache_user 是私有方法；通过 updateUser 路径缓存
            let fake = json!({ "_": "updateUser", "user": event });
            crate::system::notifications::handle_update(
                svc.inner(),
                &fake,
                &client.chat_store,
                app_handle,
                true,
            );
        }
    }

    apply_me(
        event,
        session_id,
        send_fn,
        client_ptr,
        state,
        app_handle,
        client,
    );
}

/// 自己的 user 更新（updateUser 携带我的完整 user）时刷新缓存与账户列表。
pub(super) fn update_me_from_user(
    event: &serde_json::Value,
    session_id: i64,
    client_ptr: *mut c_void,
    send_fn: TdJsonClientSend,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    client: &Arc<TdLibClient>,
) {
    if let Some(user) = event.get("user") {
        apply_me(
            user,
            session_id,
            send_fn,
            client_ptr,
            state,
            app_handle,
            client,
        );
    }
}

/// 头像文件下载完成时更新 avatar_path。
pub(super) fn maybe_update_avatar(
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
    let Some(avatar_fid) = *client.avatar_file_id.lock().unwrap() else {
        return;
    };
    if fid as i32 != avatar_fid || !flag(file, "/local/is_downloading_completed") {
        return;
    }
    let Some(path) = text(file, "/local/path") else {
        return;
    };
    *client.avatar_path.lock().unwrap() = Some(path.clone());
    if let Ok(mut meta) = state.account_meta.lock() {
        if let Some(m) = meta.get_mut(&client.id) {
            m.avatar_path = Some(path);
        }
    }
    emit_accounts_updated(app_handle, state);
}

// ==================== TDLib 官方下载列表 ====================

/// 处理 TDLib 官方下载列表 update：
/// `updateFileDownload` / `updateFileAddedToDownloads` / `updateFileRemovedFromDownloads` / `updateFileDownloads`
///
/// 数据写入发起该下载的账户 store；仅活动账户把条目变更推给前端（进 `gate` 缓冲合并）。
pub(super) fn handle_download_list_update(
    event: &serde_json::Value,
    state: &AppStateRef,
    app_handle: &tauri::AppHandle,
    gate: &mut FileGate,
    session_id: i64,
) {
    let type_name = event.get("_").and_then(|v| v.as_str()).unwrap_or("");
    let is_active_account = state.active.load(Ordering::SeqCst) == session_id;

    // 聚合统计：低频，仅活动账户透传给前端调试/角标
    if type_name == "updateFileDownloads" {
        if is_active_account {
            let _ = app_handle.emit("tdlib-download-list-stats", event);
        }
        return;
    }

    let mut store = state.download_store.lock().unwrap();
    let updated = match type_name {
        // 两种事件字段一致：Added 在 file_download 里多包一层
        "updateFileDownload" | "updateFileAddedToDownloads" => {
            let fd = if type_name == "updateFileDownload" {
                event
            } else {
                match event.get("file_download") {
                    Some(fd) => fd,
                    None => return,
                }
            };
            let Some(file_id) = fd.get("file_id").and_then(|v| v.as_i64()) else {
                return;
            };
            store.apply_download_list_state(
                Some(session_id),
                file_id as i32,
                flag(fd, "/is_paused"),
                number(fd, "/complete_date"),
                true,
                None,
                None,
                None,
            )
        }
        "updateFileRemovedFromDownloads" => {
            let Some(file_id) = event.get("file_id").and_then(|v| v.as_i64()) else {
                return;
            };
            store.apply_removed_from_downloads(Some(session_id), file_id as i32)
        }
        _ => None,
    };
    drop(store);

    if let (true, Some(item)) = (is_active_account, updated) {
        let file_id = item.session_file_id.unwrap_or(item.file_id) as i64;
        let payload = to_progress_value(&item);
        gate.push_item(file_id, "download-progress-update", payload);
    }
}

/// 冲刷到期的官方下载列表变更批次：同窗口多条合并成一条 `{ updates: [...] }`。
pub(super) fn flush_download_list_updates(app_handle: &tauri::AppHandle, gate: &mut FileGate) {
    for batch in gate.take_due() {
        let _ = app_handle.emit(batch.channel, json!({ "updates": batch.payloads }));
    }
}
