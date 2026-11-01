//! 对话列表顶部提示的 Rust 侧缓存。
//!
//! 这些 update 都是「变化时才发一次」的边沿触发类型：`updateSuggestedActions`、
//! `updateUnconfirmedSession`、`updateFreezeState`、`updateContactCloseBirthdays`。
//! 前端 webview 可能被销毁（窗口关闭 / 最小化到托盘）再重建，期间的更新会丢，
//! 所以缓存放在 Rust，前端启动时用 `get_cached_top_tips` 取一次快照。

use serde_json::{json, Value};

/// suggestedAction 的去重键：无参类型用 `_`，带参类型把参数拼进去。
fn action_key(action: &Value) -> String {
    let ty = action.get("_").and_then(Value::as_str).unwrap_or_default();
    match ty {
        "suggestedActionSetPassword" => format!(
            "{ty}:{}",
            action
                .get("authorization_delay")
                .and_then(Value::as_i64)
                .unwrap_or(0)
        ),
        "suggestedActionConvertToBroadcastGroup" => format!(
            "{ty}:{}",
            action
                .get("supergroup_id")
                .and_then(Value::as_i64)
                .unwrap_or(0)
        ),
        "suggestedActionCustom" => format!(
            "{ty}:{}",
            action.get("name").and_then(Value::as_str).unwrap_or_default()
        ),
        _ => ty.to_string(),
    }
}

/// 顶部提示的最新状态。每个账户一份，随客户端创建。
#[derive(Default)]
pub struct TopTipsState {
    /// 当前建议动作（增量合并后的全量）
    suggested_actions: Vec<Value>,
    /// 第一个未确认会话，null 表示没有
    unconfirmed_session: Option<Value>,
    /// 未确认会话总数
    unconfirmed_session_count: i64,
    /// 最近一次 updateFreezeState
    freeze_state: Option<Value>,
    /// 近期/即将过生日的联系人
    close_birthdays: Vec<Value>,
}

impl TopTipsState {
    /// 消费一条 update。非目标类型直接忽略。
    pub fn apply(&mut self, update: &Value) {
        match update.get("_").and_then(Value::as_str) {
            Some("updateSuggestedActions") => {
                let mut actions = std::mem::take(&mut self.suggested_actions);

                if let Some(removed) = update.get("removed_actions").and_then(Value::as_array) {
                    let removed: Vec<String> = removed.iter().map(action_key).collect();
                    actions.retain(|item| !removed.contains(&action_key(item)));
                }

                if let Some(added) = update.get("added_actions").and_then(Value::as_array) {
                    for action in added {
                        let key = action_key(action);
                        actions.retain(|item| action_key(item) != key);
                        actions.push(action.clone());
                    }
                }

                self.suggested_actions = actions;
            }
            Some("updateUnconfirmedSession") => {
                self.unconfirmed_session = update
                    .get("session")
                    .filter(|value| !value.is_null())
                    .cloned();
                self.unconfirmed_session_count = update
                    .get("unconfirmed_session_count")
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
            }
            Some("updateFreezeState") => {
                self.freeze_state = Some(update.clone());
            }
            Some("updateContactCloseBirthdays") => {
                self.close_birthdays = update
                    .get("close_birthday_users")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
            }
            // 退出登录 / 会话关闭：清空，避免换号后残留上一个账号的提示
            Some("updateAuthorizationState") => {
                let state = update
                    .get("authorization_state")
                    .and_then(|value| value.get("_"))
                    .and_then(Value::as_str);
                if matches!(
                    state,
                    Some("authorizationStateLoggingOut")
                        | Some("authorizationStateClosed")
                        | Some("authorizationStateWaitPhoneNumber")
                ) {
                    *self = Self::default();
                }
            }
            _ => {}
        }
    }

    /// 给前端的快照。
    pub fn snapshot(&self) -> Value {
        json!({
            "suggestedActions": self.suggested_actions,
            "unconfirmedSession": self.unconfirmed_session,
            "unconfirmedSessionCount": self.unconfirmed_session_count,
            "freezeState": self.freeze_state,
            "closeBirthdays": self.close_birthdays,
        })
    }
}
