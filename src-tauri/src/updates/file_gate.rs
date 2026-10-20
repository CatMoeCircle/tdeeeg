//! updateFile 分类闸门：里程碑立即下发、普通进度合并、无变化直接丢。
//!
//! TDLib 下载/上传时 `updateFile` 可以每几十毫秒一条，但前端对「已下载字节数」
//! 这类中间值只需要最新状态。这里在 **Rust 内存状态已逐条更新之后** 决定要不要
//! 下发，而不是对整个事件流做节流：
//!
//! | 变化 | 处理 |
//! |---|---|
//! | 完成/失败、暂停/恢复/取消、本地路径就绪、上传开始/结束、文件身份（remote.id/unique_id） | 立即下发 |
//! | 纯进度（已下载/已上传字节数、总大小） | 同一文件合并，窗口到期只发最新一条 |
//! | 与上次已下发状态完全一致 | 丢弃 |
//!
//! 关注的字段与前端 `src/utils/messageFileSnapshot.ts` 的 LOCAL_FILE_KEYS /
//! REMOTE_FILE_KEYS 对齐：那边同样只关心这些字段（且只接受终态）。
//!
//! 下发还要**按通道合并成一条**：Tauri 2 的 `emit` 把 payload 内联进一段新 JS 源码再
//! `webview.eval`，每条事件 = 渲染进程一次脚本编译。批量下载时「每个文件一条」会在
//! 100ms 窗口里撞出几十条事件，所以窗口到期时同通道的多条载荷合并成一个批次
//! （`{ updates: [...] }`），前端拆回逐条处理，语义不变。

use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// 闸门判定结果。
#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    /// 里程碑：立即下发
    Now,
    /// 进合并缓冲，窗口到期再发最新一条
    Later,
    /// 与上次已下发状态一致，丢弃
    Drop,
}

/// 变化即通知的字段：完成/暂停/上传状态、本地路径、文件身份。
#[derive(PartialEq, Eq, Clone, Default, Debug)]
struct Flags {
    has_path: bool,
    dl_active: bool,
    dl_done: bool,
    up_active: bool,
    up_done: bool,
    remote_id: String,
    unique_id: String,
}

/// 可合并的纯进度字段。
#[derive(PartialEq, Eq, Clone, Default, Debug)]
struct Gauges {
    downloaded_size: i64,
    uploaded_size: i64,
    size: i64,
    expected_size: i64,
}

#[derive(PartialEq, Eq, Clone, Default, Debug)]
struct Snap {
    flags: Flags,
    gauges: Gauges,
}

impl Snap {
    fn of(file: &Value) -> Self {
        let local = file.get("local");
        let remote = file.get("remote");
        let flag = |node: Option<&Value>, key: &str| {
            node.and_then(|n| n.get(key))
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        };
        let gauge = |node: Option<&Value>, key: &str| {
            node.and_then(|n| n.get(key))
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
        };
        let text = |node: Option<&Value>, key: &str| {
            node.and_then(|n| n.get(key))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };
        let path = local
            .and_then(|l| l.get("path"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        Self {
            flags: Flags {
                has_path: !path.is_empty(),
                dl_active: flag(local, "is_downloading_active"),
                dl_done: flag(local, "is_downloading_completed"),
                up_active: flag(remote, "is_uploading_active"),
                up_done: flag(remote, "is_uploading_completed"),
                remote_id: text(remote, "id"),
                unique_id: text(remote, "unique_id"),
            },
            gauges: Gauges {
                downloaded_size: gauge(local, "downloaded_size"),
                uploaded_size: gauge(remote, "uploaded_size"),
                size: gauge(Some(file), "size"),
                expected_size: gauge(Some(file), "expected_size"),
            },
        }
    }
}

/// 合并窗口内的纯进度载荷瘦身：去掉 `thumbnail_data_url`。
///
/// 它是载荷里最大的字段（base64 data URL），而前端只认它一次：`register_download`
/// 与 `get_downloads` 都已给过，进度事件里每条再带一遍纯属浪费（前端对 `undefined`
/// 不写回，已持有的缩略图不会因此丢失）。
fn slim_progress(mut payload: Value) -> Value {
    if let Some(obj) = payload.as_object_mut() {
        obj.remove("thumbnail_data_url");
    }
    payload
}

/// 一条待合并下发的进度载荷（通道名 + 已被 Rust 内存更新过的条目快照）。
pub struct PendingItem {
    pub channel: &'static str,
    pub payload: Value,
}

/// 里程碑原始事件（updateFile）走的通道名。下发时同样包成 `{ updates: [...] }`，
/// 前端 `src/store/tdlibBus.ts` 已经把批格式拆回逐条。
pub const RAW_CHANNEL: &str = "tdlib-update-file";

/// 一批待下发的载荷：同一通道、一次 emit。
pub struct Batch {
    pub channel: &'static str,
    pub payloads: Vec<Value>,
}

/// 按 file.id 记账的分类闸门。
pub struct FileGate {
    window: Duration,
    sent: HashMap<i64, Snap>,
    pending: HashMap<i64, PendingItem>,
    /// 里程碑原始事件缓冲（同一窗口内多个文件的 updateFile 合并成一批）
    raw: Vec<Value>,
    deadline: Option<Instant>,
}

impl FileGate {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            sent: HashMap::new(),
            pending: HashMap::new(),
            raw: Vec::new(),
            deadline: None,
        }
    }

    /// 里程碑原始事件入缓冲：与其他文件的里程碑合并成一条 `{ updates: [...] }`。
    ///
    /// 延迟上限就是本闸门窗口（调用方每轮都调 [`FileGate::take_due`]），
    /// 状态变化不会丢，只是与同窗口的其它事件一起到达。
    pub fn push_raw(&mut self, event: Value) {
        self.raw.push(event);
        if self.deadline.is_none() {
            self.deadline = Some(Instant::now() + self.window);
        }
    }

    /// 无 file 快照可比的状态变更（TDLib 官方下载列表的 added / download / removed）
    /// 直接进缓冲：它们本身就是里程碑，但批量下载时仍是每个文件各一条事件，
    /// 同窗口内同一条目只留最新一份（前端本来也按条目去重）。
    pub fn push_item(&mut self, key: i64, channel: &'static str, payload: Value) {
        self.pending.insert(
            key,
            PendingItem {
                channel,
                payload: slim_progress(payload),
            },
        );
        if self.deadline.is_none() {
            self.deadline = Some(Instant::now() + self.window);
        }
    }

    /// 判定一条已更新过内存的进度事件。
    ///
    /// `Now`：立即下发（调用方发原始 updateFile + 进度载荷）；
    /// `Later`：已进合并缓冲，由 [`FileGate::take_due`] 统一下发最新一条；
    /// `Drop`：前端已持有相同状态，无需下发。
    pub fn submit(
        &mut self,
        file_id: i64,
        file: &Value,
        channel: &'static str,
        payload: Value,
    ) -> Verdict {
        if self.sent.len() > 50_000 {
            // ponytail: 上限兜底，超了整体清空。只让前端多收几条重复状态，不影响正确性
            self.sent.clear();
        }
        let snap = Snap::of(file);
        if self.sent.get(&file_id) == Some(&snap) {
            return Verdict::Drop;
        }
        // 首次见到的文件也算里程碑：前端还没有这个 file.id 的任何状态
        let milestone = self
            .sent
            .get(&file_id)
            .map_or(true, |prev| prev.flags != snap.flags);
        self.sent.insert(file_id, snap);
        if milestone {
            // 里程碑压掉同文件还没发出去的进度，避免「完成」之后又被旧进度追着发
            self.pending.remove(&file_id);
            Verdict::Now
        } else {
            self.pending.insert(
                file_id,
                PendingItem {
                    channel,
                    payload: slim_progress(payload),
                },
            );
            if self.deadline.is_none() {
                self.deadline = Some(Instant::now() + self.window);
            }
            Verdict::Later
        }
    }

    /// 到期则取走全部合并载荷：每个文件最多一条（取最新），并按通道合成一个批次。
    pub fn take_due(&mut self) -> Vec<Batch> {
        if self.pending.is_empty() && self.raw.is_empty() {
            self.deadline = None;
            return Vec::new();
        }
        if let Some(deadline) = self.deadline {
            if Instant::now() < deadline {
                return Vec::new();
            }
        }
        self.deadline = None;

        let mut out: Vec<Batch> = Vec::new();
        for (_, item) in self.pending.drain() {
            match out.iter_mut().find(|b| b.channel == item.channel) {
                Some(batch) => batch.payloads.push(item.payload),
                None => out.push(Batch {
                    channel: item.channel,
                    payloads: vec![item.payload],
                }),
            }
        }
        if !self.raw.is_empty() {
            out.push(Batch {
                channel: RAW_CHANNEL,
                payloads: std::mem::take(&mut self.raw),
            });
        }
        out
    }

    /// 下一次 `recv_timeout` 该等多久：合并窗口剩余时间，最多 50ms。
    pub fn poll(&self) -> Duration {
        let idle = Duration::from_millis(50);
        match self.deadline {
            Some(deadline) => deadline.saturating_duration_since(Instant::now()).min(idle),
            None => idle,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn file(downloaded: i64, active: bool, completed: bool, path: Option<&str>) -> Value {
        json!({
            "id": 1,
            "size": 100,
            "local": {
                "downloaded_size": downloaded,
                "is_downloading_active": active,
                "is_downloading_completed": completed,
                "path": path.unwrap_or(""),
            },
            "remote": { "id": "R", "unique_id": "U" },
        })
    }

    /// 同状态重发（TDLib 会重复推同样的 updateFile）不该再打扰前端
    #[test]
    fn retransmitted_state_is_dropped() {
        let mut gate = FileGate::new(Duration::from_millis(100));
        let f = file(0, true, false, None);
        assert_eq!(
            gate.submit(1, &f, "download-progress-update", json!(1)),
            Verdict::Now
        );
        assert_eq!(
            gate.submit(1, &f, "download-progress-update", json!(1)),
            Verdict::Drop
        );
    }

    /// 进度合并成最新一条；完成态不等窗口，立即下发
    #[test]
    fn progress_is_coalesced_and_completion_is_immediate() {
        let mut gate = FileGate::new(Duration::ZERO);
        let start = file(0, true, false, None);
        assert_eq!(
            gate.submit(1, &start, "download-progress-update", json!("start")),
            Verdict::Now
        );
        assert_eq!(
            gate.submit(
                1,
                &file(10, true, false, None),
                "download-progress-update",
                json!("p10")
            ),
            Verdict::Later
        );
        assert_eq!(
            gate.submit(
                1,
                &file(20, true, false, None),
                "download-progress-update",
                json!("p20")
            ),
            Verdict::Later
        );
        let due = gate.take_due();
        assert_eq!(due.len(), 1, "同一文件窗口内只留最新一条");
        assert_eq!(due[0].channel, "download-progress-update");
        assert_eq!(due[0].payloads, vec![json!("p20")]);

        assert_eq!(
            gate.submit(
                1,
                &file(100, false, true, Some("/tmp/a")),
                "download-progress-update",
                json!("done")
            ),
            Verdict::Now
        );
        assert!(gate.take_due().is_empty(), "里程碑已把同文件的挂起进度压掉");
    }

    /// 下载暂停/取消、上传开始都算状态变化，立即下发
    #[test]
    fn pause_and_upload_transitions_are_immediate() {
        let mut gate = FileGate::new(Duration::from_secs(60));
        assert_eq!(
            gate.submit(
                1,
                &file(10, true, false, None),
                "download-progress-update",
                json!(1)
            ),
            Verdict::Now
        );
        assert_eq!(
            gate.submit(
                1,
                &file(10, false, false, None),
                "download-progress-update",
                json!(2)
            ),
            Verdict::Now,
            "下载 active 由 true 变 false（暂停/取消）应立即通知"
        );

        let up = json!({"id": 2, "remote": {"is_uploading_active": true, "uploaded_size": 0}});
        assert_eq!(
            gate.submit(2, &up, "upload-progress-update", json!(3)),
            Verdict::Now
        );
        let up2 = json!({"id": 2, "remote": {"is_uploading_active": true, "uploaded_size": 5}});
        assert_eq!(
            gate.submit(2, &up2, "upload-progress-update", json!(4)),
            Verdict::Later,
            "纯上传进度应合并"
        );
    }

    /// 跨文件合并：同窗口内多个文件、多个通道各自合成一条事件；
    /// 里程碑原始事件也合并成一批（否则批量下载时每文件都各发一条，前端逐条编译脚本）。
    #[test]
    fn cross_file_batches_are_grouped_per_channel() {
        let mut gate = FileGate::new(Duration::ZERO);
        let start = file(0, true, false, None);
        // 两个文件各自的首次事件是里程碑，立即下发（不进缓冲）
        assert_eq!(
            gate.submit(1, &start, "download-progress-update", json!("m1")),
            Verdict::Now
        );
        assert_eq!(
            gate.submit(2, &start, "download-progress-update", json!("m2")),
            Verdict::Now
        );
        assert_eq!(
            gate.submit(
                1,
                &file(10, true, false, None),
                "download-progress-update",
                json!("p1")
            ),
            Verdict::Later
        );
        assert_eq!(
            gate.submit(
                2,
                &file(10, true, false, None),
                "upload-progress-update",
                json!("p2")
            ),
            Verdict::Later
        );
        gate.push_raw(json!({"file": {"id": 1}}));
        gate.push_raw(json!({"file": {"id": 2}}));
        // 官方下载列表变更走同一缓冲：并进 download-progress-update 批次，且瘦掉缩略图
        gate.push_item(
            9,
            "download-progress-update",
            json!({"id": 9, "thumbnail_data_url": "data:image/png;base64,AAAA"}),
        );

        let batches = gate.take_due();
        assert_eq!(batches.len(), 3, "每个通道一条事件");
        let payloads = |name: &str| {
            batches
                .iter()
                .find(|b| b.channel == name)
                .map(|b| b.payloads.clone())
        };
        // pending 是 HashMap，同批次内的顺序不保证，按集合断言
        let progress = payloads("download-progress-update").unwrap();
        assert_eq!(progress.len(), 2, "两个文件的进度 + 一条列表变更并进同一批");
        assert!(progress.contains(&json!("p1")));
        assert!(
            progress.contains(&json!({"id": 9})),
            "列表变更条目应已瘦掉缩略图"
        );
        assert_eq!(payloads("upload-progress-update"), Some(vec![json!("p2")]));
        assert_eq!(
            payloads(RAW_CHANNEL),
            Some(vec![json!({"file": {"id": 1}}), json!({"file": {"id": 2}})])
        );
    }

    /// 合并进缓冲的进度不带缩略图 data URL（最占体积的字段，register/get_downloads 已给过）
    #[test]
    fn coalesced_progress_drops_thumbnail() {
        // 窗口为 0：里程碑立即下发，纯进度进缓冲后本轮即可取走
        let mut gate = FileGate::new(Duration::ZERO);
        let full = |downloaded: i64| {
            json!({
                "id": 1,
                "local": { "downloaded_size": downloaded, "is_downloading_active": true },
                "thumbnail_data_url": "data:image/png;base64,AAAA",
            })
        };
        // 窗口内不会到期，纯进度直接进缓冲
        assert_eq!(
            gate.submit(1, &full(0), "download-progress-update", full(0)),
            Verdict::Now
        );
        assert_eq!(
            gate.submit(1, &full(10), "download-progress-update", full(10)),
            Verdict::Later
        );
        let batches = gate.take_due();
        assert_eq!(batches.len(), 1);
        let payload = &batches[0].payloads[0];
        assert!(
            payload.get("thumbnail_data_url").is_none(),
            "合并后的进度载荷不该再带缩略图"
        );
        assert_eq!(
            payload.get("local").and_then(|l| l.get("downloaded_size")),
            Some(&json!(10))
        );
    }
}
