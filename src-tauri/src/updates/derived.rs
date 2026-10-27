//! 派生 chat/community 事件的合窗缓冲：同一窗口内同 (event, key) 只留最新一份。
//!
//! - chat-update / community-update / community-removed → key = payload.id
//! - chat-list-update → key = payload.list_key
//! - 其它事件名拿不到 key → 按 event_name 一级去重
//!
//! 保持首次出现顺序（前端依赖 chat-update 先于 chat-list-update）。
//! 窗口从缓冲内第一条开始计时，由接收循环的 flush 点驱动。

use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const DERIVED_WINDOW: Duration = Duration::from_millis(50);

#[derive(Default)]
pub struct DerivedBuffer {
    entries: Vec<(String, Value)>,
    index: HashMap<(String, String), usize>,
    opened_at: Option<Instant>,
}

fn dedupe_key(event: &str, payload: &Value) -> String {
    match event {
        "chat-update" | "community-update" | "community-removed" => payload
            .get("id")
            .map(|v| v.to_string())
            .unwrap_or_default(),
        "chat-list-update" => payload
            .get("list_key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        _ => String::new(),
    }
}

impl DerivedBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    /// 入队一条派生事件；同窗口同 key 覆盖为最新 payload。
    pub fn push(&mut self, event: String, payload: Value) {
        self.opened_at.get_or_insert_with(Instant::now);
        let key = (dedupe_key(&event, &payload), event.clone());
        match self.index.get(&key) {
            Some(&i) => self.entries[i].1 = payload,
            None => {
                self.index.insert(key, self.entries.len());
                self.entries.push((event, payload));
            }
        }
    }

    /// 窗口到期则取出全部待下发事件（并清空），否则返回空。
    pub fn take_due(&mut self) -> Vec<(String, Value)> {
        match self.opened_at {
            Some(t) if t.elapsed() >= DERIVED_WINDOW => {
                self.opened_at = None;
                self.index.clear();
                std::mem::take(&mut self.entries)
            }
            _ => Vec::new(),
        }
    }
}

// ponytail: 只测去重语义；窗口时序靠接收循环的 50ms 空闲 flush 驱动。
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn dedupes_by_key_keeps_first_order() {
        let mut b = DerivedBuffer::new();
        b.push("chat-update".into(), json!({"id": 1, "v": 1}));
        b.push("chat-list-update".into(), json!({"list_key": "main", "chat_ids": [1]}));
        b.push("chat-update".into(), json!({"id": 2, "v": 1}));
        b.push("chat-update".into(), json!({"id": 1, "v": 2}));
        b.push("chat-list-update".into(), json!({"list_key": "main", "chat_ids": [2, 1]}));
        b.push("community-update".into(), json!({"id": 7}));
        b.push("community-update".into(), json!({"id": 8}));
        b.opened_at = Some(Instant::now() - DERIVED_WINDOW);
        let out = b.take_due();
        assert_eq!(out.len(), 5);
        assert_eq!(out[0].1["v"], 2);
        assert_eq!(out[1].1["chat_ids"], json!([2, 1]));
        assert_eq!(out[2].1["id"], 2);
        assert!(b.take_due().is_empty());
    }
}
