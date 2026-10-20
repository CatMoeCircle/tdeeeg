use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use rusqlite::params;

use crate::db::Db;

/// 文件类型分类（与前端 DownloadFileType 对应）
pub type DownloadFileType = String;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DownloadItem {
    /// 稳定主键：file.remote.unique_id（不含 file_reference，同一文件恒定）。
    /// remote.unique_id 缺失时回退 file.remote.id，再回退 `session:<file_id>` / `legacy:<file_id>`。
    pub remote_id: String,
    /// 当前 TDLib 会话内的 file.id（重启后会变），用于 pause/cancel/download 等 TDLib 调用。
    #[serde(default)]
    pub session_file_id: Option<i32>,
    /// 兼容字段：当前会话 file_id
    #[serde(default)]
    pub file_id: i32,
    pub file_name: String,
    pub chat_title: String,
    #[serde(default)]
    pub chat_id: Option<i64>,
    #[serde(default)]
    pub message_id: Option<i64>,
    #[serde(default)]
    pub total_size: i64,
    #[serde(default)]
    pub downloaded_size: i64,
    #[serde(default)]
    pub progress: f64,
    #[serde(default)]
    pub is_paused: bool,
    #[serde(default)]
    pub is_completed: bool,
    #[serde(default)]
    pub local_path: Option<String>,
    #[serde(default)]
    pub thumbnail_data_url: Option<String>,
    #[serde(default)]
    pub file_type: DownloadFileType,
    #[serde(default)]
    pub is_generic: bool,
    #[serde(default)]
    pub hidden_category: Option<String>,
    #[serde(default)]
    pub is_auto_photo: bool,
    #[serde(default)]
    pub is_streaming: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub source_label: Option<String>,
    #[serde(default)]
    pub dismissed: bool,
    #[serde(default)]
    pub is_upload: bool,
    #[serde(default)]
    pub created_at: i64,
    /// 完成时间（ms）；已完成列表按此排序
    #[serde(default)]
    pub completed_at: i64,
    /// 是否收到过 TDLib updateFile 进度/完成事件。
    /// 仅 register 尚未真正开下的条目不进下载列表，避免「空进度」任务。
    #[serde(default)]
    pub has_tdlib_update: bool,
    /// 是否仍在 TDLib 官方下载列表中（addFileToDownloads）。
    /// 用户手动下载走该列表；cancel 时需 removeFileFromDownloads，避免重启后续传。
    #[serde(default)]
    pub in_tdlib_list: bool,
    /// 溯源：来源类型（sticker_set / user / chat），配合 `source_id` 供面板跳回来源
    #[serde(default)]
    pub source_kind: Option<String>,
    /// 溯源目标 id（贴纸集 id / user id / chat id）
    #[serde(default)]
    pub source_id: Option<i64>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn derive_remote_id(remote_id: Option<&str>, session_file_id: i32) -> String {
    match remote_id {
        Some(r) if !r.is_empty() => r.to_string(),
        _ => format!("session:{}", session_file_id),
    }
}

/// 条目的稳定主键：remote.unique_id → remote.id → `session:<file_id>`。
///
/// TDLib 的 remote.id 里编码了 file_reference（td/telegram/files/FileLocation.hpp：
/// `FullRemoteFileLocation::store`），而 file_reference 会随消息/上下文刷新，TDLib 文档
/// 也明确「同一文件可以有很多个有效的 remote.id」。remote.unique_id 用的是
/// `as_unique()`（不含 file_reference），同一文件跨刷新/跨对话恒定，才是真正的去重键。
pub fn derive_item_key(
    unique_id: Option<&str>,
    remote_id: Option<&str>,
    session_file_id: i32,
) -> String {
    match unique_id {
        Some(u) if !u.is_empty() => u.to_string(),
        _ => derive_remote_id(remote_id, session_file_id),
    }
}

/// 自动生成的占位文件名（空 / "文件 #12" / "File #12" / 历史 "文件_12"）
/// 与前端 isPlaceholderFileName 保持一致：这些名字不能充当文件身份。
fn is_placeholder_file_name(name: &str) -> bool {
    let name = name.trim();
    if name.is_empty() {
        return true;
    }
    if let Some((_, digits)) = name.rsplit_once('#') {
        if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    if let Some(digits) = name.strip_prefix("文件_") {
        if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    false
}

/// 把同一文件的另一条记录并入 `dst`：进度/完成态取更完整的一份，元数据互补，标签取并集。
fn merge_item_into(dst: &mut DownloadItem, src: &DownloadItem) {
    if src.total_size > dst.total_size {
        dst.total_size = src.total_size;
    }
    if src.downloaded_size > dst.downloaded_size {
        dst.downloaded_size = src.downloaded_size;
    }
    if src.progress > dst.progress {
        dst.progress = src.progress;
    }
    let dst_has_path = dst.local_path.as_ref().map(|p| !p.is_empty()).unwrap_or(false);
    let src_has_path = src.local_path.as_ref().map(|p| !p.is_empty()).unwrap_or(false);
    if src_has_path && (!dst_has_path || (src.is_completed && !dst.is_completed)) {
        dst.local_path = src.local_path.clone();
    }
    if src.is_completed && (!dst.is_completed || !dst_has_path) {
        dst.is_completed = true;
    }
    if src.completed_at > dst.completed_at {
        dst.completed_at = src.completed_at;
    }
    if dst.created_at == 0 || (src.created_at > 0 && src.created_at < dst.created_at) {
        dst.created_at = src.created_at;
    }
    if src.in_tdlib_list {
        dst.in_tdlib_list = true;
    }
    dst.has_tdlib_update = dst.has_tdlib_update || src.has_tdlib_update;
    // 流式标记只增不清（与前端约定一致）
    dst.is_streaming = dst.is_streaming || src.is_streaming;
    for tag in &src.tags {
        if !dst.tags.contains(tag) {
            dst.tags.push(tag.clone());
        }
    }
    if dst.file_name.is_empty() || (is_placeholder_file_name(&dst.file_name) && !is_placeholder_file_name(&src.file_name)) {
        dst.file_name = src.file_name.clone();
    }
    if dst.chat_title.is_empty() {
        dst.chat_title = src.chat_title.clone();
    }
    if dst.chat_id.is_none() {
        dst.chat_id = src.chat_id;
    }
    if dst.message_id.is_none() {
        dst.message_id = src.message_id;
    }
    if dst.thumbnail_data_url.is_none() {
        dst.thumbnail_data_url = src.thumbnail_data_url.clone();
    }
    if dst.source_label.is_none() {
        dst.source_label = src.source_label.clone();
    }
    // 占位条目（类型未知的通用资源）用更具体的一方补齐分类
    if dst.file_type == "other" && dst.is_generic {
        dst.file_type = src.file_type.clone();
        dst.is_generic = src.is_generic;
        dst.hidden_category = src.hidden_category.clone();
        dst.is_auto_photo = src.is_auto_photo;
    }
    // 会话内 file.id 取较大者：更可能是当前 TDLib 会话仍在用的那个
    if src.session_file_id.unwrap_or(0) > dst.session_file_id.unwrap_or(0) {
        dst.session_file_id = src.session_file_id;
        dst.file_id = if src.file_id != 0 { src.file_id } else { dst.file_id };
    }
    dst.dismissed = dst.dismissed && src.dismissed;
    if dst.is_completed {
        dst.is_paused = false;
        if dst.total_size > 0 {
            dst.downloaded_size = dst.total_size;
            dst.progress = 1.0;
        }
        if dst.completed_at == 0 {
            dst.completed_at = now_ms();
        }
    }
}

/// 单账户的下载/上传数据（下载记录持久化在 SQLite，上传任务仅内存）
#[derive(Default)]
struct AccountDownloadData {
    items: HashMap<String, DownloadItem>,
    session_map: HashMap<i32, String>,
    show_hidden: bool,
    show_auto_photos: bool,
    uploads: HashMap<String, DownloadItem>,
    upload_session_map: HashMap<i32, String>,
}

impl AccountDownloadData {
    /// 从 `downloads` / `download_prefs` 表载入该账户。
    fn load(db: &Db, account_id: i64) -> Self {
        let mut data = Self::default();
        let conn = db.conn();
        if let Ok((show_hidden, show_auto_photos)) = conn.query_row(
            "SELECT show_hidden, show_auto_photos FROM download_prefs WHERE account_id = ?1",
            [account_id],
            |r| Ok((r.get::<_, bool>(0)?, r.get::<_, bool>(1)?)),
        ) {
            data.show_hidden = show_hidden;
            data.show_auto_photos = show_auto_photos;
        }
        let Ok(mut stmt) = conn.prepare(
            "SELECT remote_id, session_file_id, file_id, file_name, chat_title, chat_id,
                    message_id, total_size, downloaded_size, progress, is_paused, is_completed,
                    local_path, thumbnail_data_url, file_type, is_generic, hidden_category,
                    is_auto_photo, is_streaming, tags, source_label, dismissed, is_upload,
                    created_at, completed_at, has_tdlib_update, in_tdlib_list, source_kind, source_id
             FROM downloads WHERE account_id = ?1",
        ) else {
            return data;
        };
        let rows = stmt.query_map([account_id], |r| {
            let tags: String = r.get(19)?;
            Ok(DownloadItem {
                remote_id: r.get(0)?,
                session_file_id: r.get(1)?,
                file_id: r.get(2)?,
                file_name: r.get(3)?,
                chat_title: r.get(4)?,
                chat_id: r.get(5)?,
                message_id: r.get(6)?,
                total_size: r.get(7)?,
                downloaded_size: r.get(8)?,
                progress: r.get(9)?,
                is_paused: r.get(10)?,
                is_completed: r.get(11)?,
                local_path: r.get(12)?,
                thumbnail_data_url: r.get(13)?,
                file_type: r.get(14)?,
                is_generic: r.get(15)?,
                hidden_category: r.get(16)?,
                is_auto_photo: r.get(17)?,
                is_streaming: r.get(18)?,
                tags: serde_json::from_str(&tags).unwrap_or_default(),
                source_label: r.get(20)?,
                dismissed: r.get(21)?,
                is_upload: r.get(22)?,
                created_at: r.get(23)?,
                completed_at: r.get(24)?,
                has_tdlib_update: r.get(25)?,
                in_tdlib_list: r.get(26)?,
                source_kind: r.get(27)?,
                source_id: r.get(28)?,
            })
        });
        if let Ok(rows) = rows {
            for item in rows.flatten() {
                data.items.insert(item.remote_id.clone(), item);
            }
        }
        data.rebuild_session_map();
        data
    }

    /// 整账户覆盖写：先删后插，语义与旧 JSON 快照一致。
    ///
    /// 自动加载的通用资源（头像/贴纸/emoji/通用缩略图，`is_generic`）与自动下载的
    /// 图片（`is_auto_photo`）是**按需重建的会话级缓存**（实测占全表 97% 以上），
    /// 只留在内存里供本次会话读写，不写入数据库。
    fn save(&self, db: &Db, account_id: i64) -> rusqlite::Result<()> {
        let conn = db.conn();
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM downloads WHERE account_id = ?1", [account_id])?;
        tx.execute(
            "INSERT INTO download_prefs (account_id, show_hidden, show_auto_photos)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(account_id) DO UPDATE SET
                 show_hidden = excluded.show_hidden,
                 show_auto_photos = excluded.show_auto_photos",
            params![account_id, self.show_hidden, self.show_auto_photos],
        )?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO downloads (
                    account_id, remote_id, session_file_id, file_id, file_name, chat_title,
                    chat_id, message_id, total_size, downloaded_size, progress, is_paused,
                    is_completed, local_path, thumbnail_data_url, file_type, is_generic,
                    hidden_category, is_auto_photo, is_streaming, tags, source_label, dismissed,
                    is_upload, created_at, completed_at, has_tdlib_update, in_tdlib_list,
                    source_kind, source_id
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                    ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30
                 )",
            )?;
            for (key, item) in self
                .items
                .iter()
                .filter(|(_, item)| !item.is_generic && !item.is_auto_photo)
            {
                let tags = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
                stmt.execute(params![
                    account_id,
                    key,
                    item.session_file_id,
                    item.file_id,
                    item.file_name,
                    item.chat_title,
                    item.chat_id,
                    item.message_id,
                    item.total_size,
                    item.downloaded_size,
                    item.progress,
                    item.is_paused,
                    item.is_completed,
                    item.local_path,
                    item.thumbnail_data_url,
                    item.file_type,
                    item.is_generic,
                    item.hidden_category,
                    item.is_auto_photo,
                    item.is_streaming,
                    tags,
                    item.source_label,
                    item.dismissed,
                    item.is_upload,
                    item.created_at,
                    item.completed_at,
                    item.has_tdlib_update,
                    item.in_tdlib_list,
                    item.source_kind,
                    item.source_id,
                ])?;
            }
        }
        tx.commit()
    }

    /// 缩略图淘汰：面板只在未隐藏的 photo/video 上显示缩略图（见 tdlib.rs get_download_page），
    /// 其余条目的 base64 data URL 清掉；保留的也只留最新 `THUMB_KEEP` 条。
    /// ponytail: 按 created_at 截断而非真 LRU，缩略图可由 TDLib 重新登记回填；要按访问淘汰再上 LRU。
    fn trim_thumbnails(&mut self) {
        const THUMB_KEEP: usize = 500;
        let displayed = |i: &DownloadItem| {
            !i.dismissed && matches!(i.file_type.as_str(), "photo" | "video")
        };
        let mut keep: Vec<(i64, String)> = Vec::new();
        for (key, item) in self.items.iter_mut() {
            if item.thumbnail_data_url.is_none() {
                continue;
            }
            if displayed(item) {
                keep.push((item.created_at, key.clone()));
            } else {
                item.thumbnail_data_url = None;
            }
        }
        keep.sort_unstable_by(|a, b| b.0.cmp(&a.0));
        for (_, key) in keep.into_iter().skip(THUMB_KEEP) {
            if let Some(item) = self.items.get_mut(&key) {
                item.thumbnail_data_url = None;
            }
        }
    }

    fn rebuild_session_map(&mut self) {
        self.session_map.clear();
        for (key, item) in &self.items {
            if let Some(sid) = item.session_file_id {
                self.session_map.insert(sid, key.clone());
            } else if item.file_id != 0 {
                self.session_map.insert(item.file_id, key.clone());
            }
        }
    }

    /// 同文件的条目（键不稳定 / 换了 remote.id）——按内容身份认亲。
    ///
    /// 每次登记新文件都会走这里，表内可能上万条：直接比字段，不再逐条 `format!`
    /// 造身份串（那是每条一次 String 分配）。
    fn find_same_file_key(&self, file_type: &str, file_name: &str, total_size: i64) -> Option<String> {
        // 探针不成立（占位名 / 大小未知）时不可能认亲，直接跳过全表扫描
        if total_size <= 0 || is_placeholder_file_name(file_name) {
            return None;
        }
        self.items
            .iter()
            .find(|(_, it)| {
                !it.dismissed
                    && it.total_size == total_size
                    && it.file_type == file_type
                    && it.file_name == file_name
            })
            .map(|(k, _)| k.clone())
    }

    /// 把条目从旧键搬到稳定键（目标键已有条目时并入），并同步 session 映射。
    fn rekey_item(&mut self, from: &str, to: &str) {
        if from == to {
            return;
        }
        let Some(mut item) = self.items.remove(from) else {
            return;
        };
        match self.items.get_mut(to) {
            Some(dst) => merge_item_into(dst, &item),
            None => {
                item.remote_id = to.to_string();
                self.items.insert(to.to_string(), item);
            }
        }
        for mapped in self.session_map.values_mut() {
            if mapped == from {
                *mapped = to.to_string();
            }
        }
    }

    fn resolve_key(&self, id: &str) -> String {
        if let Ok(sid) = id.parse::<i32>() {
            if let Some(k) = self.session_map.get(&sid) {
                return k.clone();
            }
            if let Some(k) = self.upload_session_map.get(&sid) {
                return k.clone();
            }
        }
        id.to_string()
    }

    fn find_upload_by_path(&self, local_path: &str) -> Option<String> {
        for (key, item) in &self.uploads {
            if item.local_path.as_deref() == Some(local_path) {
                return Some(key.clone());
            }
        }
        None
    }
}

/// 下载面板分页快照。
///
/// 未完成项一次全给：面板的下载中/等待/已暂停/流式分区、角标计数和「取消全部」都依赖
/// 完整集合，而它们数量少、变动频繁，分页只会让计数忽多忽少。已完成项才是大头——某个
/// 真实账户 8394 条里 8237 条是头像/贴纸/emoji/通用缩略图这类自动加载资源，所以它按
/// completed_at 倒序分页取，前端滚到底再取下一页。
#[derive(Debug, Clone, Default, Serialize)]
pub struct DownloadPage {
    pub active: Vec<DownloadItem>,
    pub completed: Vec<DownloadItem>,
    /// 当前过滤条件下已完成的条数（前端据此判断还有没有下一页、分区标题计数）
    pub completed_total: usize,
}

/// 多账户下载存储：记录存放在 SQLite 的 `downloads` / `download_prefs` 表。
pub struct DownloadStore {
    db: Arc<Db>,
    active_account: i64,
    accounts: HashMap<i64, AccountDownloadData>,
    /// 有内存改动但还没写库的账户。
    ///
    /// 高频写入——updateFile 进度（每几十毫秒一条）与登记（批量下载时前端对每个
    /// 头像/贴纸/emoji/缩略图都会登记一次）——只改内存并在这里记账，由
    /// `flush_dirty` 合并成一次写库；
    /// 状态变化（完成/暂停/取消）仍走 `save_now` 立即写库，保证崩溃时不丢最终态。
    dirty: HashSet<i64>,
}

#[allow(dead_code)]
impl DownloadStore {
    pub fn new(db: Arc<Db>, active_account: i64) -> Self {
        let mut store = Self {
            db,
            active_account,
            accounts: HashMap::new(),
            dirty: HashSet::new(),
        };
        store.ensure_loaded(store.active_account);
        store
    }

    /// 切换活动账户（命令层在 switch_account 时调用）
    pub fn set_active_account(&mut self, account_id: i64) {
        self.active_account = account_id;
        self.ensure_loaded(account_id);
    }

    pub fn active_account(&self) -> i64 {
        self.active_account
    }

    /// 懒加载账户数据
    fn ensure_loaded(&mut self, account_id: i64) {
        if self.accounts.contains_key(&account_id) {
            return;
        }
        let data = AccountDownloadData::load(&self.db, account_id);
        self.accounts.insert(account_id, data);
    }

    fn data_mut(&mut self, account_id: i64) -> &mut AccountDownloadData {
        self.ensure_loaded(account_id);
        self.accounts.get_mut(&account_id).expect("account download data loaded")
    }

    fn data(&mut self, account_id: i64) -> &mut AccountDownloadData {
        self.data_mut(account_id)
    }

    /// 立即写库：登记 / 完成 / 暂停 / 取消 等低频但重要的状态变化。
    fn save_now(&mut self, account_id: i64) {
        if let Some(d) = self.accounts.get_mut(&account_id) {
            d.trim_thumbnails();
            if let Err(e) = d.save(&self.db, account_id) {
                eprintln!("[db] 保存下载记录失败: {e}");
            }
        }
        self.dirty.remove(&account_id);
    }

    /// 只记账不写库（高频进度 / 登记）：真正的写库由 `flush_dirty` 合并完成。
    fn mark_dirty(&mut self, account_id: i64) {
        self.dirty.insert(account_id);
    }

    /// 把记过账的账户各写一份最新快照，返回实际写库的账户数。
    pub fn flush_dirty(&mut self) -> usize {
        let accounts: Vec<i64> = self.dirty.drain().collect();
        for acct in &accounts {
            if let Some(d) = self.accounts.get_mut(acct) {
                d.trim_thumbnails();
                if let Err(e) = d.save(&self.db, *acct) {
                    eprintln!("[db] 保存下载记录失败: {e}");
                }
            }
        }
        accounts.len()
    }

    // ==================== 查询 ====================

    pub fn get_all_items(&self) -> Vec<DownloadItem> {
        self.get_all_items_for(self.active_account)
    }

    pub fn get_all_items_for(&self, account_id: i64) -> Vec<DownloadItem> {
        let Some(d) = self.accounts.get(&account_id) else {
            return Vec::new();
        };
        let mut items: Vec<DownloadItem> = d.items.values().cloned().collect();
        items.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then_with(|| b.file_id.cmp(&a.file_id))
        });
        items
    }

    pub fn get_item(&self, key: &str) -> Option<DownloadItem> {
        self.get_item_for(self.active_account, key)
    }

    pub fn get_item_for(&self, account_id: i64, key: &str) -> Option<DownloadItem> {
        let d = self.accounts.get(&account_id)?;
        let k = d.resolve_key(key);
        d.items.get(&k).cloned()
    }

    // ==================== 分页查询（下载面板） ====================

    /// 面板排序时间：已完成取 completed_at，其余取 created_at（与前端分区排序一致）
    fn panel_sort_at(item: &DownloadItem) -> i64 {
        if item.is_completed {
            item.completed_at
        } else {
            item.created_at
        }
    }

    /// 面板排序：时间倒序，同值按 file_id、remote_id，保证分页边界稳定（不漏不重）。
    fn panel_order(a: &DownloadItem, b: &DownloadItem) -> std::cmp::Ordering {
        Self::panel_sort_at(b)
            .cmp(&Self::panel_sort_at(a))
            .then_with(|| b.file_id.cmp(&a.file_id))
            .then_with(|| b.remote_id.cmp(&a.remote_id))
    }

    /// 取一页面板快照；`offset` 为已完成列表里的偏移。
    ///
    /// `include_generic` / `include_auto_photos` 来自前端过滤器开关：这两类行默认隐藏，
    /// 若不在排序后滤掉，每页几乎全是头像/贴纸，翻半天看不到一条用户下载。
    pub fn get_page(
        &self,
        account_id: i64,
        offset: usize,
        limit: usize,
        include_generic: bool,
        include_auto_photos: bool,
    ) -> DownloadPage {
        let Some(d) = self.accounts.get(&account_id) else {
            return DownloadPage::default();
        };
        let mut active: Vec<&DownloadItem> = Vec::new();
        let mut completed: Vec<&DownloadItem> = Vec::new();
        for item in d.items.values() {
            if !item.has_tdlib_update || item.dismissed {
                continue;
            }
            if !item.is_completed {
                active.push(item);
            } else if (include_generic || !item.is_generic)
                && (include_auto_photos || !item.is_auto_photo)
            {
                completed.push(item);
            }
        }
        // 只排引用、只克隆本页：整表 clone + 序列化正是打开面板卡 300+ ms 的原因
        active.sort_by(|a, b| Self::panel_order(a, b));
        completed.sort_by(|a, b| Self::panel_order(a, b));
        DownloadPage {
            completed_total: completed.len(),
            active: active.into_iter().cloned().collect(),
            completed: completed
                .into_iter()
                .skip(offset)
                .take(limit)
                .cloned()
                .collect(),
        }
    }

    pub fn get_active_items(&self) -> Vec<DownloadItem> {
        self.get_active_items_for(self.active_account)
    }

    pub fn get_active_items_for(&self, account_id: i64) -> Vec<DownloadItem> {
        let Some(d) = self.accounts.get(&account_id) else {
            return Vec::new();
        };
        d.items
            .values()
            .filter(|item| {
                // 仅展示真正收到过 TDLib update 的任务（register 后未开下的不进列表）
                item.has_tdlib_update
                    && !item.is_generic
                    && !item.is_auto_photo
                    && !item.is_completed
                    && !item.dismissed
                    && !item.is_streaming
            })
            .cloned()
            .collect()
    }

    pub fn get_active_count(&self) -> usize {
        self.get_active_items().len()
    }

    pub fn get_visible_items(&self) -> Vec<DownloadItem> {
        self.get_visible_items_for(self.active_account)
    }

    pub fn get_visible_items_for(&self, account_id: i64) -> Vec<DownloadItem> {
        let Some(d) = self.accounts.get(&account_id) else {
            return Vec::new();
        };
        let mut items: Vec<DownloadItem> = d
            .items
            .values()
            .filter(|item| {
                item.has_tdlib_update
                    && !item.dismissed
                    && (d.show_hidden || !item.is_generic)
                    && (d.show_auto_photos || !item.is_auto_photo)
            })
            .cloned()
            .collect();
        items.sort_by(|a, b| {
            // 已完成按完成时间倒序，未完成按创建时间
            let a_key = if a.is_completed { a.completed_at } else { a.created_at };
            let b_key = if b.is_completed { b.completed_at } else { b.created_at };
            b_key.cmp(&a_key).then_with(|| b.file_id.cmp(&a.file_id))
        });
        items
    }

    pub fn has_hidden_active(&self) -> bool {
        let Some(d) = self.accounts.get(&self.active_account) else {
            return false;
        };
        d.items.values().any(|item| {
            item.has_tdlib_update
                && (item.is_generic || item.is_auto_photo)
                && !item.is_completed
                && !item.dismissed
        })
    }

    // ==================== 写入 ====================

    #[allow(clippy::too_many_arguments)]
    pub fn register_download(
        &mut self,
        account_id: Option<i64>,
        remote_id: Option<String>,
        session_file_id: i32,
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
        tags: Option<Vec<String>>,
        source_label: Option<String>,
        source_kind: Option<String>,
        source_id: Option<i64>,
    ) -> String {
        let acct = account_id.unwrap_or(self.active_account);
        let rid = derive_remote_id(remote_id.as_deref(), session_file_id);
        let rid_is_stable = !rid.starts_with("session:") && !rid.starts_with("legacy:");

        // 若该会话曾指向 session:/legacy: 键，尽量迁到 remote_id 键
        let existing_key = self
            .data(acct)
            .session_map
            .get(&session_file_id)
            .cloned();
        let use_key = if let Some(old_key) = existing_key {
            if old_key != rid && !old_key.starts_with("legacy:") && !old_key.starts_with("session:")
            {
                old_key
            } else if old_key != rid {
                let data = self.data_mut(acct);
                data.rekey_item(&old_key, &rid);
                if let Some(item) = data.items.get_mut(&rid) {
                    item.session_file_id = Some(session_file_id);
                    item.file_id = session_file_id;
                }
                rid
            } else {
                rid
            }
        } else {
            rid
        };

        // 同一文件的历史条目（键为旧 remote.id、无稳定身份）：收编到稳定键，
        // 而不是再插一行——否则 TDLib 刷新 file_reference 后同一文件会出现两条下载。
        let key_missing = rid_is_stable && !self.data(acct).items.contains_key(&use_key);
        let same_file_key = if key_missing {
            self.data(acct)
                .find_same_file_key(&file_type, &file_name, total_size)
        } else {
            None
        };
        if let Some(old_key) = same_file_key {
            if old_key != use_key {
                self.data_mut(acct).rekey_item(&old_key, &use_key);
            }
        }

        self.merge_register(
            acct,
            &use_key,
            session_file_id,
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
            tags,
            source_label,
            source_kind,
            source_id,
        );
        self.data_mut(acct)
            .session_map
            .insert(session_file_id, use_key.clone());
        // 登记与进度走同一个合并窗口，不逐次全量落盘：批量下载时前端对**每个**
        // 媒体资源（头像/贴纸/emoji/缩略图…）都会登记一次，逐次整表写盘正是窗口
        // 卡顿的来源。登记只是「先占键位」，最终态由完成/暂停/取消各自的 save_now
        // 保证；正常退出时 RunEvent::ExitRequested 还会兜底 flush_dirty。
        self.mark_dirty(acct);
        use_key
    }

    #[allow(clippy::too_many_arguments)]
    fn merge_register(
        &mut self,
        account_id: i64,
        key: &str,
        session_file_id: i32,
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
        tags: Option<Vec<String>>,
        source_label: Option<String>,
        source_kind: Option<String>,
        source_id: Option<i64>,
    ) {
        let d = self.data_mut(account_id);
        if let Some(existing) = d.items.get_mut(key) {
            if !existing.dismissed {
                // 原地更新：登记在消息列表里每个媒体资源都会走一次，克隆整条
                // （含 base64 缩略图字符串）纯属浪费
                let is_fallback = existing.file_type == "other" && existing.is_generic;
                if is_fallback {
                    existing.file_type = file_type;
                    existing.is_generic = is_generic;
                    existing.hidden_category = hidden_category;
                    existing.is_auto_photo = is_auto_photo;
                    // 占位条目的分类被更具体的一方覆盖，标签同样整组替换
                    if let Some(incoming) = tags.filter(|t| !t.is_empty()) {
                        existing.tags = incoming;
                    }
                } else if let Some(incoming) = tags.filter(|t| !t.is_empty()) {
                    let mut merged = std::mem::take(&mut existing.tags);
                    for t in incoming {
                        if !merged.contains(&t) {
                            merged.push(t);
                        }
                    }
                    existing.tags = merged;
                }
                if existing.file_name.starts_with("文件 #") && !file_name.is_empty() {
                    existing.file_name = file_name;
                }
                if existing.chat_title.is_empty() && !chat_title.is_empty() {
                    existing.chat_title = chat_title;
                }
                if existing.thumbnail_data_url.is_none() {
                    existing.thumbnail_data_url = thumbnail_data_url;
                }
                if source_label.is_some() {
                    existing.source_label = source_label;
                }
                // 溯源信息只在本次登记带了新值时才覆盖，避免重复登记把来源清空
                if source_kind.is_some() {
                    existing.source_kind = source_kind;
                    existing.source_id = source_id;
                }
                if existing.total_size == 0 && total_size > 0 {
                    existing.total_size = total_size;
                }
                existing.is_streaming = existing.is_streaming || is_streaming;
                existing.session_file_id = Some(session_file_id);
                existing.file_id = session_file_id;
                existing.remote_id = key.to_string();
                if existing.created_at == 0 {
                    existing.created_at = now_ms();
                }
                return;
            }
        }

        d.items.insert(
            key.to_string(),
            DownloadItem {
                remote_id: key.to_string(),
                session_file_id: Some(session_file_id),
                file_id: session_file_id,
                file_name,
                chat_title,
                chat_id,
                message_id,
                total_size,
                downloaded_size: 0,
                progress: 0.0,
                is_paused: false,
                is_completed: false,
                local_path: None,
                thumbnail_data_url,
                file_type,
                is_generic,
                hidden_category,
                is_auto_photo,
                is_streaming,
                tags: tags.unwrap_or_default(),
                source_label,
                dismissed: false,
                is_upload: false,
                created_at: now_ms(),
                completed_at: 0,
                has_tdlib_update: false,
                in_tdlib_list: false,
                source_kind,
                source_id,
            },
        );
    }

    /// updateFile 时：绑定 session → 条目键（在指定账户下）。
    ///
    /// TDLib file.id 仅会话内有效，可能被不同文件复用。有稳定 id（unique_id）时必须以其
    /// 为准重绑 session_map；否则沿用旧绑定会把进度/路径写到错误条目（媒体乱串）。
    pub fn bind_session_key(
        &mut self,
        account_id: i64,
        session_file_id: i32,
        unique_id: Option<&str>,
        remote_id: Option<&str>,
    ) -> String {
        let key = derive_item_key(unique_id, remote_id, session_file_id);
        let has_stable_id = unique_id.map(|r| !r.is_empty()).unwrap_or(false)
            || remote_id.map(|r| !r.is_empty()).unwrap_or(false);
        let d = self.data_mut(account_id);

        if has_stable_id {
            // session:xxx → 稳定键迁移：稳定 id 就绪前条目可能挂在 session 键上，
            // 不迁移则 update_progress 按稳定键查不到，进度/完成态被静默丢弃。
            if let Some(old_key) = d.session_map.get(&session_file_id).cloned() {
                if old_key != key && (old_key.starts_with("session:") || old_key.starts_with("legacy:")) {
                    d.rekey_item(&old_key, &key);
                    if let Some(item) = d.items.get_mut(&key) {
                        item.session_file_id = Some(session_file_id);
                        item.file_id = session_file_id;
                    }
                }
            }
            d.session_map.insert(session_file_id, key.clone());
            if let Some(item) = d.items.get_mut(&key) {
                item.session_file_id = Some(session_file_id);
                item.file_id = session_file_id;
                if item.remote_id.is_empty() {
                    item.remote_id = key.clone();
                }
            }
            return key;
        }

        if let Some(existing) = d.session_map.get(&session_file_id).cloned() {
            return existing;
        }
        if d.items.contains_key(&key) {
            if let Some(item) = d.items.get_mut(&key) {
                item.session_file_id = Some(session_file_id);
                item.file_id = session_file_id;
                if item.remote_id.is_empty() {
                    item.remote_id = key.clone();
                }
            }
        }
        d.session_map.insert(session_file_id, key.clone());
        key
    }

    pub fn update_progress(
        &mut self,
        account_id: Option<i64>,
        id: &str,
        downloaded_size: i64,
        total_size: i64,
        is_downloading_active: bool,
        is_downloading_completed: bool,
        local_path: Option<String>,
    ) {
        let acct = account_id.unwrap_or(self.active_account);
        let key = self.data(acct).resolve_key(id);
        // 查不到条目时按当前进度补一条，禁止静默丢 updateFile（键分裂/先于 register 到达）
        if !self.data_mut(acct).items.contains_key(&key) {
            let session_file_id = key
                .strip_prefix("session:")
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0);
            let item = DownloadItem {
                remote_id: key.clone(),
                session_file_id: if session_file_id != 0 { Some(session_file_id) } else { None },
                file_id: session_file_id,
                file_name: if session_file_id != 0 {
                    format!("文件 #{}", session_file_id)
                } else {
                    format!("文件 #{}", key)
                },
                chat_title: String::new(),
                chat_id: None,
                message_id: None,
                total_size,
                downloaded_size,
                progress: if total_size > 0 {
                    downloaded_size as f64 / total_size as f64
                } else if is_downloading_completed {
                    1.0
                } else {
                    0.0
                },
                is_paused: !is_downloading_active && !is_downloading_completed,
                is_completed: is_downloading_completed,
                local_path: local_path.clone().filter(|p| !p.is_empty()),
                thumbnail_data_url: None,
                file_type: "other".to_string(),
                is_generic: true,
                hidden_category: None,
                is_auto_photo: false,
                is_streaming: false,
                tags: Vec::new(),
                source_label: None,
                dismissed: false,
                is_upload: false,
                created_at: now_ms(),
                completed_at: if is_downloading_completed { now_ms() } else { 0 },
                has_tdlib_update: true,
                in_tdlib_list: false,
                source_kind: None,
                source_id: None,
            };
            self.data_mut(acct).items.insert(key.clone(), item);
            if session_file_id != 0 {
                self.data_mut(acct).session_map.insert(session_file_id, key.clone());
            }
        }
        let d = self.data_mut(acct);
        if let Some(item) = d.items.get_mut(&key) {
            let total = if total_size > 0 {
                total_size
            } else {
                item.total_size
            };
            item.total_size = total;
            item.downloaded_size = downloaded_size;
            item.progress = if total > 0 {
                downloaded_size as f64 / total as f64
            } else if is_downloading_completed {
                1.0
            } else {
                0.0
            };
            item.is_paused = !is_downloading_active && !is_downloading_completed;
            // 收到 TDLib update 后才允许进入下载列表（避免空进度任务）
            item.has_tdlib_update = true;
            item.is_completed = is_downloading_completed;
            if is_downloading_completed {
                if item.completed_at == 0 {
                    item.completed_at = now_ms();
                }
                if let Some(path) = local_path {
                    if !path.is_empty() {
                        item.local_path = Some(path);
                    }
                }
            }
        }
        // 纯进度：只改内存 + 记账，由持久化线程合并写盘（见 flush_dirty）
        self.mark_dirty(acct);
    }

    pub fn set_paused(&mut self, account_id: Option<i64>, id: &str, paused: bool) -> bool {
        let acct = account_id.unwrap_or(self.active_account);
        let key = self.data(acct).resolve_key(id);
        let d = self.data_mut(acct);
        if let Some(item) = d.items.get_mut(&key) {
            item.is_paused = paused;
            self.save_now(acct);
            true
        } else {
            false
        }
    }

    /// 应用 TDLib 下载列表状态（updateFileDownload / updateFileAddedToDownloads）。
    ///
    /// - `is_completed` 仅在已有 `local_path` 时写入完成态；`complete_date` 只记账
    ///   `completed_at`，本地路径仍由 `updateFile` 回写。
    /// - 返回更新后的条目，供活动账户推前端。
    pub fn apply_download_list_state(
        &mut self,
        account_id: Option<i64>,
        session_file_id: i32,
        is_paused: bool,
        complete_date: i64,
        in_tdlib_list: bool,
        file_name: Option<String>,
        chat_id: Option<i64>,
        message_id: Option<i64>,
    ) -> Option<DownloadItem> {
        let acct = account_id.unwrap_or(self.active_account);
        let key = {
            let d = self.data(acct);
            d.session_map
                .get(&session_file_id)
                .cloned()
                .unwrap_or_else(|| format!("session:{}", session_file_id))
        };
        let completed_at_ms = if complete_date > 0 {
            complete_date * 1000
        } else {
            0
        };
        let d = self.data_mut(acct);
        if let Some(item) = d.items.get_mut(&key) {
            item.session_file_id = Some(session_file_id);
            item.file_id = session_file_id;
            item.is_paused = is_paused;
            item.has_tdlib_update = true;
            item.in_tdlib_list = item.in_tdlib_list || in_tdlib_list;
            if completed_at_ms > 0 {
                if item.completed_at == 0 {
                    item.completed_at = completed_at_ms;
                }
                // 已有本地路径时视为完成；路径由 updateFile 补齐
                if item.local_path.as_ref().map(|p| !p.is_empty()).unwrap_or(false) {
                    item.is_completed = true;
                    item.is_paused = false;
                    if item.total_size > 0 {
                        item.downloaded_size = item.total_size;
                        item.progress = 1.0;
                    }
                }
            }
            if let Some(name) = file_name {
                if !name.is_empty() && (item.file_name.is_empty() || item.file_name.starts_with("文件 #")) {
                    item.file_name = name;
                }
            }
            if item.chat_id.is_none() {
                item.chat_id = chat_id;
            }
            if item.message_id.is_none() {
                item.message_id = message_id;
            }
            let snapshot = item.clone();
            self.save_now(acct);
            return Some(snapshot);
        }

        // 本地 store 尚无该文件（重启后 TDLib 列表先到 / UI 未 register）：登记占位条目
        let file_name = file_name.unwrap_or_else(|| format!("文件 #{}", session_file_id));
        let item = DownloadItem {
            remote_id: key.clone(),
            session_file_id: Some(session_file_id),
            file_id: session_file_id,
            file_name,
            chat_title: String::new(),
            chat_id,
            message_id,
            total_size: 0,
            downloaded_size: 0,
            progress: 0.0,
            is_paused,
            is_completed: false,
            local_path: None,
            thumbnail_data_url: None,
            file_type: "other".to_string(),
            is_generic: true,
            hidden_category: None,
            is_auto_photo: false,
            is_streaming: false,
            tags: Vec::new(),
            source_label: None,
            dismissed: false,
            is_upload: false,
            created_at: now_ms(),
            completed_at: completed_at_ms,
            has_tdlib_update: true,
            in_tdlib_list,
            source_kind: None,
            source_id: None,
        };
        let snapshot = Some(item.clone());
        d.items.insert(key.clone(), item);
        d.session_map.insert(session_file_id, key);
        self.save_now(acct);
        snapshot
    }

    /// updateFileRemovedFromDownloads：移出 TDLib 下载列表。
    /// 未完成且无实质进度的条目直接 dismiss，避免列表残留「幽灵任务」。
    pub fn apply_removed_from_downloads(
        &mut self,
        account_id: Option<i64>,
        session_file_id: i32,
    ) -> Option<DownloadItem> {
        let acct = account_id.unwrap_or(self.active_account);
        let key = {
            let d = self.data(acct);
            d.session_map
                .get(&session_file_id)
                .cloned()
                .unwrap_or_else(|| format!("session:{}", session_file_id))
        };
        let d = self.data_mut(acct);
        let item = d.items.get_mut(&key)?;
        item.in_tdlib_list = false;
        if !item.is_completed {
            let never_started = item.downloaded_size <= 0
                && item.progress <= 0.0
                && item.local_path.as_ref().map(|p| p.is_empty()).unwrap_or(true);
            if never_started {
                item.dismissed = true;
            } else if item.local_path.as_ref().map(|p| !p.is_empty()).unwrap_or(false) {
                item.is_completed = true;
                item.is_paused = false;
            }
        }
        let snapshot = item.clone();
        self.save_now(acct);
        Some(snapshot)
    }

    pub fn dismiss_item(&mut self, account_id: Option<i64>, id: &str) -> bool {
        let acct = account_id.unwrap_or(self.active_account);
        let key = self.data(acct).resolve_key(id);
        let d = self.data_mut(acct);
        if let Some(item) = d.items.get_mut(&key) {
            item.dismissed = true;
            self.save_now(acct);
            true
        } else {
            false
        }
    }

    pub fn clear_completed(&mut self, account_id: Option<i64>) {
        let acct = account_id.unwrap_or(self.active_account);
        self.data_mut(acct)
            .items
            .retain(|_, item| !item.is_completed && !item.dismissed);
        self.save_now(acct);
    }

    pub fn get_show_hidden(&self) -> bool {
        self.accounts
            .get(&self.active_account)
            .map(|d| d.show_hidden)
            .unwrap_or(false)
    }

    pub fn set_show_hidden(&mut self, value: bool) {
        let acct = self.active_account;
        self.data_mut(acct).show_hidden = value;
        self.save_now(acct);
    }

    pub fn get_show_auto_photos(&self) -> bool {
        self.accounts
            .get(&self.active_account)
            .map(|d| d.show_auto_photos)
            .unwrap_or(false)
    }

    pub fn set_show_auto_photos(&mut self, value: bool) {
        let acct = self.active_account;
        self.data_mut(acct).show_auto_photos = value;
        self.save_now(acct);
    }

    // ==================== 上传（仅内存，按账户隔离） ====================

    #[allow(clippy::too_many_arguments)]
    pub fn register_upload(
        &mut self,
        account_id: Option<i64>,
        remote_id: Option<String>,
        session_file_id: i32,
        file_name: String,
        file_type: String,
        chat_title: String,
        total_size: i64,
        thumbnail_data_url: Option<String>,
        local_path: Option<String>,
    ) {
        let acct = account_id.unwrap_or(self.active_account);
        let rid = derive_remote_id(remote_id.as_deref(), session_file_id);

        if let Some(local) = local_path.as_deref() {
            if !local.is_empty() {
                if let Some(existing_key) = self.data(acct).find_upload_by_path(local) {
                    if existing_key != rid {
                        if let Some(mut existing) = self.data_mut(acct).uploads.remove(&existing_key)
                        {
                            existing.remote_id = rid.clone();
                            existing.session_file_id = Some(session_file_id);
                            existing.file_id = session_file_id;
                            self.data_mut(acct).uploads.insert(rid.clone(), existing);
                            self.data_mut(acct)
                                .upload_session_map
                                .insert(session_file_id, rid.clone());
                            return;
                        }
                    }
                }
            }
        }

        {
            let d = self.data_mut(acct);
            if let Some(existing) = d.uploads.get_mut(&rid) {
                let is_fallback = existing.file_type == "other";
                if existing.file_name.is_empty() {
                    existing.file_name = file_name;
                }
                if is_fallback {
                    existing.file_type = file_type;
                }
                if existing.chat_title.is_empty() {
                    existing.chat_title = chat_title;
                }
                if existing.total_size == 0 {
                    existing.total_size = total_size;
                }
                if existing.thumbnail_data_url.is_none() {
                    existing.thumbnail_data_url = thumbnail_data_url;
                }
                if existing.local_path.is_none() {
                    existing.local_path = local_path;
                }
                existing.session_file_id = Some(session_file_id);
                existing.file_id = session_file_id;
                d.upload_session_map.insert(session_file_id, rid);
                return;
            }

            let mut tags = vec!["上传".to_string()];
            match file_type.as_str() {
                "photo" => tags.push("图片".to_string()),
                "video" => tags.push("视频".to_string()),
                "audio" => tags.push("音乐".to_string()),
                "document" => tags.push("文件".to_string()),
                _ => {}
            }

            d.uploads.insert(
                rid.clone(),
                DownloadItem {
                    remote_id: rid.clone(),
                    session_file_id: Some(session_file_id),
                    file_id: session_file_id,
                    file_name,
                    chat_title,
                    chat_id: None,
                    message_id: None,
                    total_size,
                    downloaded_size: 0,
                    progress: 0.0,
                    is_paused: false,
                    is_completed: false,
                    local_path,
                    thumbnail_data_url,
                    file_type,
                    is_generic: false,
                    hidden_category: None,
                    is_auto_photo: false,
                    is_streaming: false,
                    tags,
                    source_label: None,
                    dismissed: false,
                    is_upload: true,
                    created_at: now_ms(),
                    completed_at: 0,
                    has_tdlib_update: false,
                    in_tdlib_list: false,
                    source_kind: None,
                    source_id: None,
                },
            );
            d.upload_session_map.insert(session_file_id, rid);
        }
    }

    pub fn update_upload_progress(
        &mut self,
        account_id: Option<i64>,
        id: &str,
        uploaded_size: i64,
        total_size: i64,
        is_uploading_active: bool,
        is_uploading_completed: bool,
    ) -> Option<DownloadItem> {
        let acct = account_id.unwrap_or(self.active_account);
        let d = self.data_mut(acct);
        let key = if d.uploads.contains_key(id) {
            id.to_string()
        } else {
            d.upload_session_map
                .get(&id.parse::<i32>().ok()?)
                .cloned()
                .unwrap_or_else(|| id.to_string())
        };
        let item = d.uploads.get_mut(&key)?;
        let total = if total_size > 0 {
            total_size
        } else {
            item.total_size
        };
        item.total_size = total;
        item.downloaded_size = uploaded_size;
        item.progress = if total > 0 {
            uploaded_size as f64 / total as f64
        } else {
            0.0
        };
        item.is_completed = is_uploading_completed;
        item.is_paused = !is_uploading_active && !is_uploading_completed;
        Some(item.clone())
    }

    pub fn get_uploads(&self) -> Vec<DownloadItem> {
        self.get_uploads_for(self.active_account)
    }

    pub fn get_uploads_for(&self, account_id: i64) -> Vec<DownloadItem> {
        let Some(d) = self.accounts.get(&account_id) else {
            return Vec::new();
        };
        let mut items: Vec<DownloadItem> = d.uploads.values().cloned().collect();
        items.sort_by(|a, b| b.file_id.cmp(&a.file_id));
        items
    }

    pub fn dismiss_upload(&mut self, account_id: Option<i64>, id: &str) -> bool {
        let acct = account_id.unwrap_or(self.active_account);
        let d = self.data_mut(acct);
        let key = if d.uploads.contains_key(id) {
            id.to_string()
        } else {
            match id.parse::<i32>() {
                Ok(sid) => d
                    .upload_session_map
                    .get(&sid)
                    .cloned()
                    .unwrap_or_else(|| id.to_string()),
                Err(_) => id.to_string(),
            }
        };
        if let Some(item) = d.uploads.remove(&key) {
            if let Some(sid) = item.session_file_id {
                d.upload_session_map.remove(&sid);
            }
            return true;
        }
        d.uploads.remove(id).is_some()
    }

    /// 账户登出：丢弃内存缓存并删除该账户的下载记录。
    pub fn drop_account(&mut self, account_id: i64) {
        self.accounts.remove(&account_id);
        self.dirty.remove(&account_id);
        let conn = self.db.conn();
        let _ = conn.execute("DELETE FROM downloads WHERE account_id = ?1", [account_id]);
        let _ = conn.execute("DELETE FROM download_prefs WHERE account_id = ?1", [account_id]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_db(tag: &str) -> (PathBuf, Arc<Db>) {
        let dir = std::env::temp_dir().join(format!("tdgram-dl-{}-{}", tag, now_ms()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let db = Arc::new(Db::open(&dir).expect("open db"));
        (dir, db)
    }

    fn stored_keys(db: &Db, account_id: i64) -> Vec<String> {
        let conn = db.conn();
        let mut stmt = conn
            .prepare("SELECT remote_id FROM downloads WHERE account_id = ?1 ORDER BY remote_id")
            .unwrap();
        let rows = stmt.query_map([account_id], |r| r.get::<_, String>(0)).unwrap();
        rows.flatten().collect()
    }

    fn stored_downloaded_size(db: &Db, account_id: i64) -> Option<i64> {
        db.conn()
            .query_row(
                "SELECT downloaded_size FROM downloads WHERE account_id = ?1",
                [account_id],
                |r| r.get(0),
            )
            .ok()
    }

    fn make_item(
        key: &str,
        file_name: &str,
        total_size: i64,
        downloaded_size: i64,
        is_completed: bool,
        local_path: Option<&str>,
        session_file_id: i32,
    ) -> DownloadItem {
        DownloadItem {
            remote_id: key.to_string(),
            session_file_id: Some(session_file_id),
            file_id: session_file_id,
            file_name: file_name.to_string(),
            chat_title: "chat".to_string(),
            chat_id: None,
            message_id: None,
            total_size,
            downloaded_size,
            progress: if total_size > 0 {
                downloaded_size as f64 / total_size as f64
            } else {
                0.0
            },
            is_paused: false,
            is_completed,
            local_path: local_path.map(|p| p.to_string()),
            thumbnail_data_url: None,
            file_type: "audio".to_string(),
            is_generic: false,
            hidden_category: None,
            is_auto_photo: false,
            is_streaming: false,
            tags: Vec::new(),
            source_label: None,
            dismissed: false,
            is_upload: false,
            created_at: now_ms(),
            completed_at: if is_completed { now_ms() } else { 0 },
            has_tdlib_update: true,
            in_tdlib_list: false,
            source_kind: None,
            source_id: None,
        }
    }

    /// 同一文件换了 remote.id：注册时收编老条目，而不是再插一行
    #[test]
    fn register_adopts_row_of_same_file() {
        let (dir, db) = temp_db("adopt");
        let account = 3;
        let mut store = DownloadStore::new(db.clone(), account);

        let old_key = store.register_download(
            None,
            Some("OLD_REMOTE_ID".to_string()),
            11,
            "song.mp3".to_string(),
            "chat".to_string(),
            100,
            "audio".to_string(),
            None,
            None,
            None,
            false,
            None,
            false,
            false,
            None,
            None,
            None,
            None,
        );
        assert_eq!(old_key, "OLD_REMOTE_ID");

        // 同一文件的新稳定 id（remote.unique_id）——应并入老条目而非新插一行
        let new_key = store.register_download(
            None,
            Some("NEW_UNIQUE_ID".to_string()),
            12,
            "song.mp3".to_string(),
            "chat".to_string(),
            100,
            "audio".to_string(),
            None,
            None,
            None,
            false,
            None,
            false,
            false,
            None,
            None,
            None,
            None,
        );
        assert_eq!(new_key, "NEW_UNIQUE_ID");
        assert_eq!(store.get_all_items().len(), 1, "同一文件不应出现两行");
        // 老键的会话映射随之指向新键
        let by_session = store.get_item_for(account, "11").expect("resolved by session id");
        assert_eq!(by_session.remote_id, "NEW_UNIQUE_ID");
        drop(store);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn placeholder_names_are_not_identity() {
        let mut data = AccountDownloadData::default();
        data.items.insert(
            "song".to_string(),
            DownloadItem {
                remote_id: "song".to_string(),
                file_name: "song.mp3".to_string(),
                file_type: "audio".to_string(),
                total_size: 100,
                ..Default::default()
            },
        );
        // 占位名 / 空名 / 大小未知 都不作为认亲依据（正向也要能认）
        for name in ["文件 #12", "File #12", "文件_12", "", "   "] {
            assert_eq!(data.find_same_file_key("audio", name, 100), None, "{name:?}");
        }
        assert_eq!(data.find_same_file_key("audio", "song.mp3", 0), None);
        assert_eq!(
            data.find_same_file_key("audio", "song.mp3", 100).as_deref(),
            Some("song")
        );
        // 类型/大小不同即不同文件
        assert_eq!(data.find_same_file_key("video", "song.mp3", 100), None);
    }

    /// 老库（`downloads` 没有溯源两列）打开后自动补列，旧记录照常读出
    #[test]
    fn old_schema_is_migrated_with_source_columns() {
        let dir = std::env::temp_dir().join(format!(
            "tdgram-dl-migrate-{}-{}",
            now_ms(),
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        {
            let conn = rusqlite::Connection::open(dir.join(crate::db::DB_FILE)).unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE downloads (
                    account_id INTEGER NOT NULL, remote_id TEXT NOT NULL, session_file_id INTEGER,
                    file_id INTEGER NOT NULL DEFAULT 0, file_name TEXT NOT NULL DEFAULT '',
                    chat_title TEXT NOT NULL DEFAULT '', chat_id INTEGER, message_id INTEGER,
                    total_size INTEGER NOT NULL DEFAULT 0, downloaded_size INTEGER NOT NULL DEFAULT 0,
                    progress REAL NOT NULL DEFAULT 0, is_paused INTEGER NOT NULL DEFAULT 0,
                    is_completed INTEGER NOT NULL DEFAULT 0, local_path TEXT, thumbnail_data_url TEXT,
                    file_type TEXT NOT NULL DEFAULT '', is_generic INTEGER NOT NULL DEFAULT 0,
                    hidden_category TEXT, is_auto_photo INTEGER NOT NULL DEFAULT 0,
                    is_streaming INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]',
                    source_label TEXT, dismissed INTEGER NOT NULL DEFAULT 0,
                    is_upload INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0,
                    completed_at INTEGER NOT NULL DEFAULT 0,
                    has_tdlib_update INTEGER NOT NULL DEFAULT 0,
                    in_tdlib_list INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (account_id, remote_id)
                );
                INSERT INTO downloads (account_id, remote_id, file_name, source_label)
                    VALUES (1, 'OLD', 'x.jpg', '旧来源');
                "#,
            )
            .unwrap();
        }
        let db = Arc::new(Db::open(&dir).expect("open old db"));
        let store = DownloadStore::new(db, 1);
        let item = store.get_item("OLD").expect("old row survives migration");
        assert_eq!(item.source_label.as_deref(), Some("旧来源"));
        assert_eq!(item.source_kind, None);
        assert_eq!(item.source_id, None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn item_key_prefers_unique_id() {
        assert_eq!(
            derive_item_key(Some("UNIQUE"), Some("REMOTE"), 5),
            "UNIQUE"
        );
        assert_eq!(derive_item_key(None, Some("REMOTE"), 5), "REMOTE");
        assert_eq!(derive_item_key(Some(""), Some(""), 5), "session:5");
    }

    /// 高频进度不写库：只记账，flush 时合并成一次完整快照
    #[test]
    fn progress_updates_are_deferred_until_flush() {
        let (dir, db) = temp_db("deferred");
        let account = 3;
        let mut store = DownloadStore::new(db.clone(), account);
        // 用户下载（audio，非自动缓存）才有落库意义
        store.register_download(
            None,
            Some("FILE".to_string()),
            5,
            "song.mp3".to_string(),
            "chat".to_string(),
            100,
            "audio".to_string(),
            None,
            None,
            None,
            false,
            None,
            false,
            false,
            None,
            None,
            None,
            None,
        );

        store.update_progress(Some(account), "FILE", 10, 100, true, false, None);
        assert!(stored_keys(&db, account).is_empty(), "纯进度更新不应立即写库");

        assert_eq!(store.flush_dirty(), 1, "记账的账户应被写库");
        assert_eq!(stored_downloaded_size(&db, account), Some(10));

        store.update_progress(Some(account), "FILE", 50, 100, true, false, None);
        assert_eq!(stored_downloaded_size(&db, account), Some(10), "合并窗口内不写库");

        store.flush_dirty();
        assert_eq!(stored_downloaded_size(&db, account), Some(50));

        assert_eq!(store.flush_dirty(), 0, "没有新改动时不该重复写库");
        drop(store);
        let _ = fs::remove_dir_all(&dir);
    }

    /// 登记不逐次全量落库；自动加载的会话级缓存（头像/贴纸/emoji/通用缩略图、
    /// 自动下载图片）不进数据库，用户下载照常落库
    #[test]
    fn register_defers_write_and_skips_auto_cache() {
        let (dir, db) = temp_db("autocache");
        let account = 3;
        let mut store = DownloadStore::new(db.clone(), account);

        let register = |store: &mut DownloadStore,
                        rid: &str,
                        sid: i32,
                        name: &str,
                        file_type: &str,
                        is_generic: bool,
                        is_auto_photo: bool| {
            store.register_download(
                None,
                Some(rid.to_string()),
                sid,
                name.to_string(),
                "chat".to_string(),
                100,
                file_type.to_string(),
                None,
                None,
                None,
                is_generic,
                None,
                is_auto_photo,
                false,
                None,
                None,
                None,
                None,
            )
        };

        register(&mut store, "USER_FILE", 1, "report.pdf", "document", false, false);
        register(&mut store, "AVATAR", 2, "avatar.jpg", "avatar", true, false);
        register(&mut store, "STICKER", 3, "sticker.webp", "sticker", true, false);
        register(&mut store, "AUTO_PHOTO", 4, "photo_1.jpg", "photo", false, true);
        assert!(stored_keys(&db, account).is_empty(), "登记只记账，不逐次全量写库");

        store.update_progress(Some(account), "USER_FILE", 50, 100, true, false, None);
        store.update_progress(Some(account), "AVATAR", 50, 100, true, false, None);
        assert_eq!(store.flush_dirty(), 1);

        assert_eq!(stored_keys(&db, account), vec!["USER_FILE"], "用户下载必须落库");
        // 内存里仍然齐全：本次会话的隐藏分类、角标照常工作
        assert_eq!(store.get_all_items().len(), 4);
        assert_eq!(store.get_active_count(), 1);
        drop(store);
        let _ = fs::remove_dir_all(&dir);
    }

    /// 落库的条目能被新进程（新 store）读回来
    #[test]
    fn records_survive_reload() {
        let (dir, db) = temp_db("reload");
        let account = 9;
        let mut store = DownloadStore::new(db.clone(), account);
        store.register_download(
            None,
            Some("FILE".to_string()),
            5,
            "song.mp3".to_string(),
            "chat".to_string(),
            100,
            "audio".to_string(),
            None,
            None,
            None,
            false,
            None,
            false,
            false,
            Some(vec!["音乐".to_string()]),
            Some("来源".to_string()),
            Some("sticker_set".to_string()),
            Some(4242),
        );
        store.update_progress(
            Some(account),
            "FILE",
            100,
            100,
            false,
            true,
            Some("/tmp/song.mp3".to_string()),
        );
        store.flush_dirty();

        let reloaded = DownloadStore::new(db.clone(), account);
        let item = reloaded.get_item("FILE").expect("reloaded item");
        assert!(item.is_completed);
        assert_eq!(item.local_path.as_deref(), Some("/tmp/song.mp3"));
        assert_eq!(item.tags, vec!["音乐".to_string()]);
        assert_eq!(item.source_label.as_deref(), Some("来源"));
        assert_eq!(item.source_kind.as_deref(), Some("sticker_set"));
        assert_eq!(item.source_id, Some(4242));
        drop(reloaded);
        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }

    /// 分页边界：已完成按 completed_at 倒序分页、默认滤掉头像等通用资源、
    /// 未完成项一次性全给（面板分区/角标依赖完整集合）
    #[test]
    fn page_paginates_completed_and_returns_all_active() {
        let (dir, db) = temp_db("page");
        let account = 5;
        let mut store = DownloadStore::new(db, account);

        let mut items = HashMap::new();
        for i in 0..5i32 {
            let mut it = make_item(
                &format!("C{}", i),
                &format!("f{}.mp3", i),
                100,
                100,
                true,
                Some("/tmp/x"),
                100 + i,
            );
            it.completed_at = (i as i64 + 1) * 1000;
            items.insert(it.remote_id.clone(), it);
        }
        // 已完成但属于默认隐藏的通用资源（头像）：不在默认分页结果里
        let mut avatar = make_item("AVATAR", "avatar.jpg", 10, 10, true, Some("/tmp/a"), 900);
        avatar.is_generic = true;
        avatar.completed_at = 999_999;
        items.insert(avatar.remote_id.clone(), avatar);
        // 未完成项：无论分页偏移都全量返回
        let active = make_item("ACT", "downloading.mp3", 100, 10, false, None, 42);
        items.insert(active.remote_id.clone(), active);
        store.accounts.get_mut(&account).expect("account loaded").items = items;

        let first = store.get_page(account, 0, 2, false, false);
        assert_eq!(first.active.len(), 1, "未完成项全量返回");
        assert_eq!(first.completed_total, 5, "默认隐藏通用资源");
        assert_eq!(first.completed.len(), 2);
        assert_eq!(first.completed[0].remote_id, "C4", "已完成按 completed_at 倒序");

        let second = store.get_page(account, 2, 2, false, false);
        assert_eq!(second.completed[0].remote_id, "C2");
        let tail = store.get_page(account, 4, 2, false, false);
        assert_eq!(tail.completed.len(), 1, "最后一页不补空");
        assert_eq!(tail.completed[0].remote_id, "C0");

        // 打开「隐藏资源」：通用资源参与分页（completed_at 最大 → 第一页第一行）
        let with_generic = store.get_page(account, 0, 2, true, false);
        assert_eq!(with_generic.completed_total, 6);
        assert_eq!(with_generic.completed[0].remote_id, "AVATAR");
        assert_eq!(with_generic.completed[1].remote_id, "C4");

        drop(store);
        let _ = fs::remove_dir_all(&dir);
    }
}
