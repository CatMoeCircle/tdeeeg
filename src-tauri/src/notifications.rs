//! 系统原生通知：在 Rust 侧处理 TDLib 通知更新并弹出 Toast。
//!
//! 前端只负责把显示参数（开关/预览/发送者姓名/前台通知）同步到 Rust，
//! 以及告知当前打开的聊天 id。TDLib 的 `notification_group_count_max`
//! 由本模块按开关设置：开启=10，关闭=0。

use crate::toast_identity;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

/// Unigram 同款：超过 1 小时的历史通知不再弹窗
const MAX_NOTIFICATION_AGE_SEC: i64 = 3600;
/// 7 秒内同会话连续通知只保留首条弹窗
const RAPID_SUPPRESS: Duration = Duration::from_secs(7);
/// 开启通知时 TDLib 的 notification_group_count_max
const GROUP_COUNT_WHEN_ENABLED: i32 = 10;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NotificationPrefs {
    pub enabled: bool,
    pub show_preview: bool,
    pub show_sender_name: bool,
    pub when_app_focused: bool,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            enabled: true,
            show_preview: true,
            show_sender_name: true,
            when_app_focused: true,
        }
    }
}

#[derive(Default)]
pub struct NotificationService {
    prefs: Mutex<NotificationPrefs>,
    /// 当前打开的聊天（null=未打开聊天详情）
    active_chat_id: Mutex<Option<i64>>,
    /// 连接是否处于 Updating（避免历史通知刷屏）
    connection_updating: Mutex<bool>,
    /// chat_id → 上次弹窗时间
    last_popup_at: Mutex<HashMap<i64, Instant>>,
    /// user_id → 精简 user 缓存（显示名 / 头像 file）
    users: Mutex<HashMap<i64, Value>>,
    /// my_id（来自 getMe / Options.MyId）
    my_id: Mutex<Option<i64>>,
    /// 上次成功写入 TDLib 的 notification_group_count_max 对应 enabled 值
    /// None=尚未写入过，避免重复 setOption
    last_applied_group_count: Mutex<Option<bool>>,
}

impl NotificationService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn prefs(&self) -> NotificationPrefs {
        self.prefs.lock().unwrap().clone()
    }

    pub fn set_prefs(&self, prefs: NotificationPrefs) {
        *self.prefs.lock().unwrap() = prefs;
    }

    /// 返回是否需要更新 TDLib option（仅 enabled 实际变化时）
    pub fn take_enabled_changed(&self, enabled: bool) -> bool {
        let mut last = self.last_applied_group_count.lock().unwrap();
        if *last == Some(enabled) {
            return false;
        }
        *last = Some(enabled);
        true
    }

    /// 启动/Ready 时强制重放 option
    pub fn mark_group_count_unknown(&self) {
        *self.last_applied_group_count.lock().unwrap() = None;
    }

    pub fn set_active_chat(&self, chat_id: Option<i64>) {
        *self.active_chat_id.lock().unwrap() = chat_id;
    }

    pub fn set_my_id(&self, id: i64) {
        *self.my_id.lock().unwrap() = Some(id);
    }

    fn is_updating(&self) -> bool {
        *self.connection_updating.lock().unwrap()
    }

    fn active_chat(&self) -> Option<i64> {
        *self.active_chat_id.lock().unwrap()
    }

    fn cache_user(&self, user: &Value) {
        let Some(id) = user.get("id").and_then(|v| v.as_i64()) else {
            return;
        };
        let slim = json!({
            "id": id,
            "first_name": user.get("first_name").cloned().unwrap_or(Value::String(String::new())),
            "last_name": user.get("last_name").cloned().unwrap_or(Value::String(String::new())),
            "profile_photo": user.get("profile_photo").cloned().unwrap_or(Value::Null),
            "username": user.pointer("/usernames/active_usernames/0")
                .cloned()
                .unwrap_or(Value::Null),
        });
        self.users.lock().unwrap().insert(id, slim);
    }

    fn user_display_name(&self, user_id: i64) -> Option<String> {
        let users = self.users.lock().unwrap();
        let u = users.get(&user_id)?;
        let first = u.get("first_name").and_then(|v| v.as_str()).unwrap_or("");
        let last = u.get("last_name").and_then(|v| v.as_str()).unwrap_or("");
        let name = format!("{first} {last}").trim().to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }

    fn user_avatar_local_path(&self, user_id: i64) -> Option<String> {
        let users = self.users.lock().unwrap();
        let u = users.get(&user_id)?;
        photo_local_path(u.get("profile_photo")?)
    }
}

/// 从 profilePhoto / chatPhotoInfo JSON 取 small 本地路径（仅已下载）
fn photo_local_path(photo: &Value) -> Option<String> {
    let small = photo.get("small")?;
    let completed = small
        .pointer("/local/is_downloading_completed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !completed {
        return None;
    }
    small
        .pointer("/local/path")
        .and_then(|v| v.as_str())
        .filter(|p| !p.is_empty())
        .map(|s| s.to_string())
}

/// 从 message JSON 提取预览文案
fn message_preview(msg: &Value) -> String {
    let content = match msg.get("content") {
        Some(c) => c,
        None => return "新消息".into(),
    };
    let text_of = |key: &str| -> String {
        content
            .pointer(&format!("/{key}/text"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let t = content.get("_").and_then(|v| v.as_str()).unwrap_or("");
    match t {
        "messageText" => text_of("text"),
        "messagePhoto" => text_of("caption"),
        "messageVideo" => text_of("caption"),
        "messageAnimation" => text_of("caption"),
        "messageVoiceNote" => text_of("caption"),
        "messageAudio" => {
            let cap = text_of("caption");
            if !cap.is_empty() {
                return cap;
            }
            let performer = content
                .pointer("/audio/performer")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let title = content
                .pointer("/audio/title")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("{performer} - {title}").trim().to_string()
        }
        "messageDocument" => {
            let cap = text_of("caption");
            if !cap.is_empty() {
                return cap;
            }
            content
                .pointer("/document/file_name")
                .and_then(|v| v.as_str())
                .unwrap_or("文件")
                .to_string()
        }
        "messageSticker" => {
            let emoji = content
                .pointer("/sticker/emoji")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if emoji.is_empty() {
                "贴纸".into()
            } else {
                format!("{emoji} 贴纸")
            }
        }
        "messagePoll" => content
            .pointer("/poll/question/text")
            .and_then(|v| v.as_str())
            .unwrap_or("投票")
            .to_string(),
        "messageLocation" => "位置".into(),
        "messageContact" => "联系人".into(),
        "messageDice" => {
            let emoji = content
                .get("emoji")
                .and_then(|v| v.as_str())
                .unwrap_or("🎲");
            format!("{emoji} 骰子")
        }
        "messageCall" => {
            if content
                .get("is_video")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                "视频通话".into()
            } else {
                "语音通话".into()
            }
        }
        "messageGame" => content
            .pointer("/game/title")
            .and_then(|v| v.as_str())
            .unwrap_or("游戏")
            .to_string(),
        _ => {
            if text_of("caption").is_empty() {
                "新消息".into()
            } else {
                text_of("caption")
            }
        }
    }
}

fn sender_name_from_msg(svc: &NotificationService, msg: &Value) -> Option<String> {
    let sender = msg.get("sender_id")?;
    let kind = sender.get("_").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "messageSenderUser" => {
            let uid = sender.get("user_id").and_then(|v| v.as_i64())?;
            svc.user_display_name(uid)
        }
        "messageSenderChat" => None, // 群名已在 chat title
        _ => None,
    }
}

/// 处理 TDLib 更新。由接收线程在 rename_json_key(@type→_) 之后调用。
pub fn handle_update(
    svc: &NotificationService,
    event: &Value,
    chat_store: &Mutex<crate::chat_store::ChatStore>,
    app_handle: &tauri::AppHandle,
    is_active_account: bool,
) {
    let Some(type_) = event.get("_").and_then(|v| v.as_str()) else {
        return;
    };

    match type_ {
        "updateConnectionState" => {
            let updating = event
                .pointer("/state/_")
                .and_then(|v| v.as_str())
                .map(|s| s == "connectionStateUpdating")
                .unwrap_or(false);
            *svc.connection_updating.lock().unwrap() = updating;
        }
        "updateUser" => {
            if let Some(user) = event.get("user") {
                svc.cache_user(user);
            }
        }
        "updateNewChat" => {
            // chat_store 已缓存；无需额外处理
        }
        "updateAuthorizationState" => {
            let ready = event
                .pointer("/authorization_state/_")
                .and_then(|v| v.as_str())
                == Some("authorizationStateReady");
            if ready {
                // Ready 后重放一次 option（TDLib 刚建连，上次值可能未生效）
                svc.mark_group_count_unknown();
                apply_group_count_max(app_handle, svc.prefs().enabled);
            }
        }
        "updateNotificationGroup" => {
            if !is_active_account {
                return;
            }
            handle_notification_group(svc, event, chat_store, app_handle);
        }
        _ => {}
    }
}

/// 按开关设置 TDLib notification_group_count_max（开启 10 / 关闭 0）。
pub fn apply_group_count_max(app_handle: &tauri::AppHandle, enabled: bool) {
    let count = if enabled {
        GROUP_COUNT_WHEN_ENABLED
    } else {
        0
    };
    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::tdlib::AppState>();
        let req = json!({
            "_": "setOption",
            "name": "notification_group_count_max",
            "value": { "_": "optionValueInteger", "value": count.to_string() }
        });
        if let Err(e) = crate::tdlib::send_request(state.inner(), req).await {
            eprintln!("[notifications] setOption notification_group_count_max failed: {e}");
        }
    });
}

/// 前端同步显示参数 / 开关。
/// 仅当 enabled 真正变化时才写 TDLib notification_group_count_max，
/// 其他显示参数（预览/姓名/前台）只改内存，不触发 setOption。
#[tauri::command]
pub fn set_notification_prefs(
    app_handle: tauri::AppHandle,
    service: tauri::State<'_, NotificationService>,
    prefs: NotificationPrefs,
) {
    let enabled = prefs.enabled;
    service.set_prefs(prefs);
    if service.take_enabled_changed(enabled) {
        apply_group_count_max(&app_handle, enabled);
    }
}

/// 前端同步当前打开的聊天（null / 缺省表示未打开）
#[tauri::command]
pub fn set_active_chat_for_notifications(
    service: tauri::State<'_, NotificationService>,
    chat_id: Option<i64>,
) {
    service.set_active_chat(chat_id);
}

fn should_skip_presentation(svc: &NotificationService, chat_id: i64, date: i64) -> bool {
    let prefs = svc.prefs();
    if !prefs.enabled {
        return true;
    }
    if svc.is_updating() {
        return true;
    }
    if svc.active_chat() == Some(chat_id) {
        return true;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if date < now - MAX_NOTIFICATION_AGE_SEC {
        return true;
    }
    false
}

fn should_skip_focus(svc: &NotificationService, app_handle: &tauri::AppHandle) -> bool {
    if svc.prefs().when_app_focused {
        return false;
    }
    if let Some(w) = app_handle.get_webview_window("main") {
        return w.is_focused().unwrap_or(false);
    }
    false
}

fn handle_notification_group(
    svc: &NotificationService,
    event: &Value,
    chat_store: &Mutex<crate::chat_store::ChatStore>,
    app_handle: &tauri::AppHandle,
) {
    let Some(chat_id) = event.get("chat_id").and_then(|v| v.as_i64()) else {
        return;
    };
    let Some(added) = event.get("added_notifications").and_then(|v| v.as_array()) else {
        return;
    };
    if added.is_empty() {
        return;
    }

    // 只处理新消息类型
    let Some(note) = added.iter().rev().find(|n| {
        n.pointer("/type/_").and_then(|v| v.as_str()) == Some("notificationTypeNewMessage")
    }) else {
        return;
    };

    let Some(msg) = note.pointer("/type/message") else {
        return;
    };
    let date = note.get("date").and_then(|v| v.as_i64()).unwrap_or(0);
    let is_silent = note
        .get("is_silent")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let tdlib_show_preview = note
        .pointer("/type/show_preview")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if msg.get("is_outgoing").and_then(|v| v.as_bool()).unwrap_or(false) {
        return;
    }
    if should_skip_presentation(svc, chat_id, date) {
        return;
    }
    if should_skip_focus(svc, app_handle) {
        return;
    }

    // 7 秒内同会话连发：只弹首条
    {
        let mut last = svc.last_popup_at.lock().unwrap();
        if let Some(t) = last.get(&chat_id) {
            if t.elapsed() < RAPID_SUPPRESS {
                return;
            }
        }
        last.insert(chat_id, Instant::now());
    }

    let prefs = svc.prefs();
    let chat_title = {
        let store = chat_store.lock().unwrap();
        store
            .chats
            .get(&chat_id)
            .map(|c| c.title.clone())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "新消息".into())
    };

    let chat_type = chat_store
        .lock()
        .unwrap()
        .chats
        .get(&chat_id)
        .and_then(|c| c.chat_type.get("_").and_then(|v| v.as_str()).map(|s| s.to_string()));

    let is_group = matches!(
        chat_type.as_deref(),
        Some("chatTypeBasicGroup") | Some("chatTypeSupergroup") | Some("chatTypeSecret")
    );

    // 关闭「发送者姓名」= 隐私模式：不显示头像与任何个人名称，只提示有一条新消息
    let hide_identity = !prefs.show_sender_name;

    let preview = if hide_identity || !(prefs.show_preview && tdlib_show_preview) {
        "你有一条新消息".to_string()
    } else {
        message_preview(msg)
    };

    let sender = if !hide_identity && is_group && prefs.show_sender_name {
        sender_name_from_msg(svc, msg)
    } else {
        None
    };

    // 标题：
    // - 隐藏身份：一律「新消息」（私聊群聊都不露出名字）
    // - 群组：群名；私聊：「发送者 → 自己」
    let my_name = svc
        .my_id
        .lock()
        .unwrap()
        .and_then(|id| svc.user_display_name(id));
    let title = if hide_identity {
        "新消息".to_string()
    } else if is_group {
        chat_title.clone()
    } else {
        let sender_name = sender_name_from_msg(svc, msg).unwrap_or_else(|| chat_title.clone());
        match &my_name {
            Some(me) => format!("{sender_name} → {me}"),
            None => sender_name,
        }
    };

    let body = if hide_identity {
        "你有一条新消息".to_string()
    } else {
        match &sender {
            Some(s) => format!("{s}: {preview}"),
            None => preview,
        }
    };

    // 头像：隐藏身份时不附图；否则优先发送者，其次会话头像
    let avatar = if hide_identity {
        None
    } else {
        let store = chat_store.lock().unwrap();
        let chat_photo = store.chats.get(&chat_id).and_then(|c| c.photo.as_ref());
        let user_id = msg
            .pointer("/sender_id/user_id")
            .and_then(|v| v.as_i64());
        let user_photo = user_id.and_then(|uid| svc.user_avatar_local_path(uid));
        user_photo.or_else(|| chat_photo.and_then(|p| photo_local_path(p)))
    };

    if let Err(e) = toast_identity::show_system_notification(title, body, avatar, is_silent) {
        eprintln!("[notifications] show toast failed: {e}");
    }
}

/// 初始化：管理服务状态（setup 中调用）
pub fn init(app: &mut tauri::App) {
    app.manage(NotificationService::new());
}
