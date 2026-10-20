//! TDLib UpdateManager：分类 + 批处理，把海量 update 收敛为少量 Tauri 事件。
//!
//! 目标链路：
//!   TDLib → UpdateManager（分类/批处理）→ 少量 Tauri events → Store → Vue
//!
//! 而不是：
//!   TDLib → 一个 tdlib-update → 所有组件各自 listen() + if 过滤
//!
//! 事件通道（前端只在这些通道上 listen 一次）：
//! - `tdlib-auth`        updateAuthorizationState（立即）
//! - `tdlib-connection`  updateConnectionState（立即）
//! - `tdlib-option`      updateOption（立即）
//! - `tdlib-language`    updateLanguagePackStrings（立即）
//! - `tdlib-colors`      updateAccentColors / updateProfileAccentColors（立即）
//! - `tdlib-user`        用户/群组相关（50ms 批）
//! - `tdlib-chat`        对话相关（50ms 批）
//! - `tdlib-message`     消息相关（50ms 批）
//! - `tdlib-other`       其余稀有类型（立即，保证不丢）
//! - `tdlib-update-file` updateFile（已有独立高频通道，不进本模块）

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// 更新分类：决定走哪条 IPC 通道、是否批处理。
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum UpdateCategory {
    Auth,
    Connection,
    Option,
    Language,
    Colors,
    User,
    Chat,
    Message,
    Other,
}

impl UpdateCategory {
    /// Tauri 事件名。
    pub fn event_name(self) -> &'static str {
        match self {
            UpdateCategory::Auth => "tdlib-auth",
            UpdateCategory::Connection => "tdlib-connection",
            UpdateCategory::Option => "tdlib-option",
            UpdateCategory::Language => "tdlib-language",
            UpdateCategory::Colors => "tdlib-colors",
            UpdateCategory::User => "tdlib-user",
            UpdateCategory::Chat => "tdlib-chat",
            UpdateCategory::Message => "tdlib-message",
            UpdateCategory::Other => "tdlib-other",
        }
    }

    /// 是否需要批处理（高频类型）。
    pub fn is_batched(self) -> bool {
        matches!(
            self,
            UpdateCategory::User | UpdateCategory::Chat | UpdateCategory::Message
        )
    }
}

/// 按 `_`（原 `@type`）分类。
///
/// 注意：这里用前缀匹配覆盖 TDLib 的 update* 家族，避免漏分类导致事件丢失。
/// 分类错误只影响「走哪条通道」，不会丢数据——兜底是 Other。
pub fn classify(type_name: &str) -> UpdateCategory {
    match type_name {
        "updateAuthorizationState" => UpdateCategory::Auth,
        "updateConnectionState" => UpdateCategory::Connection,
        "updateOption" => UpdateCategory::Option,
        "updateLanguagePackStrings" => UpdateCategory::Language,
        "updateAccentColors" | "updateProfileAccentColors" => UpdateCategory::Colors,

        // 消息：高频（新消息/编辑/已读/删除/回应）
        t if t.starts_with("updateMessage")
            || t == "updateNewMessage"
            || t == "updateDeleteMessages"
            || t == "updateDeleteChatMessages" =>
        {
            UpdateCategory::Message
        }

        // 对话：高频（列表位置/标题/头像/未读）
        t if t.starts_with("updateChat") || t == "updateNewChat" => UpdateCategory::Chat,

        // 用户/群组：高频（在线状态、资料、成员）
        t if t.starts_with("updateUser")
            || t == "updateNewUser"
            || t.starts_with("updateBasicGroup")
            || t.starts_with("updateSupergroup")
            || t == "updateSecretChat" =>
        {
            UpdateCategory::User
        }

        // 稀有类型（贴纸、故事、付款、代理、通知组等）→ 立即透传
        _ => UpdateCategory::Other,
    }
}

/// 批处理窗口：窗口内同类 update 合并为一次 IPC。
const BATCH_WINDOW: Duration = Duration::from_millis(50);
/// 单批上限：超过则提前冲刷，避免一次 payload 过大。
const MAX_BATCH: usize = 64;

struct BatchState {
    items: Vec<Value>,
    opened_at: Instant,
}

/// UpdateManager：按分类缓冲高频 update，定时/定量冲刷。
pub struct UpdateManager {
    batches: Mutex<HashMap<UpdateCategory, BatchState>>,
}

impl UpdateManager {
    pub fn new() -> Self {
        Self {
            batches: Mutex::new(HashMap::new()),
        }
    }

    /// 送入一条已分类的 update。
    /// - 立即类：直接 `emit`（单条也包成 `{updates:[...]}`，前端协议统一）
    /// - 批处理类：入缓冲；窗口到期或触顶则冲刷
    pub fn push(&self, app: &tauri::AppHandle, category: UpdateCategory, event: Value) {
        if !category.is_batched() {
            emit_batch(app, category, vec![event]);
            return;
        }

        let mut should_flush = false;
        {
            let mut map = self.batches.lock().unwrap();
            let entry = map.entry(category).or_insert_with(|| BatchState {
                items: Vec::new(),
                opened_at: Instant::now(),
            });
            entry.items.push(event);
            if entry.items.len() >= MAX_BATCH || entry.opened_at.elapsed() >= BATCH_WINDOW {
                should_flush = true;
            }
        }
        if should_flush {
            self.flush_category(app, category);
        }
    }

    /// 冲刷全部到期批次（接收循环每轮调用一次）。
    pub fn flush_due(&self, app: &tauri::AppHandle) {
        let due: Vec<UpdateCategory> = {
            let map = self.batches.lock().unwrap();
            map.iter()
                .filter(|(_, b)| !b.items.is_empty() && b.opened_at.elapsed() >= BATCH_WINDOW)
                .map(|(c, _)| *c)
                .collect()
        };
        for cat in due {
            self.flush_category(app, cat);
        }
    }

    /// 冲刷指定分类的缓冲（取出后 emit）。
    fn flush_category(&self, app: &tauri::AppHandle, category: UpdateCategory) {
        let items = {
            let mut map = self.batches.lock().unwrap();
            match map.get_mut(&category) {
                Some(b) if !b.items.is_empty() => std::mem::take(&mut b.items),
                _ => return,
            }
        };
        emit_batch(app, category, items);
    }

    /// 关闭前冲刷残留（退出路径预留）。
    #[allow(dead_code)]
    pub fn flush_all(&self, app: &tauri::AppHandle) {
        let cats: Vec<UpdateCategory> = {
            let map = self.batches.lock().unwrap();
            map.keys().copied().collect()
        };
        for cat in cats {
            self.flush_category(app, cat);
        }
    }
}

fn emit_batch(app: &tauri::AppHandle, category: UpdateCategory, updates: Vec<Value>) {
    if updates.is_empty() {
        return;
    }
    let payload = json!({ "updates": updates });
    if let Err(e) = app.emit(category.event_name(), &payload) {
        eprintln!(
            "Failed to emit {} batch ({} items): {}",
            category.event_name(),
            updates.len(),
            e
        );
    }
}
