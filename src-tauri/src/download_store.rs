use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// 文件类型分类（与前端 DownloadFileType 对应）
pub type DownloadFileType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    /// 稳定主键：file.remote.id（跨重启/跨会话不变）。
    /// 本地未上传或 remote.id 为空时，回退为 `session:<file_id>` / `legacy:<file_id>`。
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedData {
    items: HashMap<String, DownloadItem>,
    #[serde(default)]
    show_hidden: bool,
    #[serde(default)]
    show_auto_photos: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct PersistedDataV1 {
    items: HashMap<i32, DownloadItemV1>,
    #[serde(default)]
    show_hidden: bool,
    #[serde(default)]
    show_auto_photos: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct DownloadItemV1 {
    file_id: i32,
    file_name: String,
    chat_title: String,
    #[serde(default)]
    chat_id: Option<i64>,
    #[serde(default)]
    message_id: Option<i64>,
    #[serde(default)]
    total_size: i64,
    #[serde(default)]
    downloaded_size: i64,
    #[serde(default)]
    progress: f64,
    #[serde(default)]
    is_paused: bool,
    #[serde(default)]
    is_completed: bool,
    #[serde(default)]
    local_path: Option<String>,
    #[serde(default)]
    thumbnail_data_url: Option<String>,
    #[serde(default)]
    file_type: String,
    #[serde(default)]
    is_generic: bool,
    #[serde(default)]
    hidden_category: Option<String>,
    #[serde(default)]
    is_auto_photo: bool,
    #[serde(default)]
    is_streaming: bool,
    #[serde(default)]
    dismissed: bool,
    #[serde(default)]
    is_upload: bool,
    #[serde(default)]
    created_at: i64,
}

/// 单账户的下载/上传数据（独立持久化）
#[derive(Default)]
struct AccountDownloadData {
    items: HashMap<String, DownloadItem>,
    session_map: HashMap<i32, String>,
    show_hidden: bool,
    show_auto_photos: bool,
    uploads: HashMap<String, DownloadItem>,
    upload_session_map: HashMap<i32, String>,
}

/// 账户独立 downloads.json 路径：
/// `data_dir/TDLib/accounts/<account_id>/downloads/downloads.json`
/// （与 TDLib 账户目录同树，登出删除账户目录时一并清理）
pub fn account_downloads_json(data_dir: &Path, account_id: i64) -> PathBuf {
    data_dir
        .join("TDLib")
        .join("accounts")
        .join(account_id.to_string())
        .join("downloads")
        .join("downloads.json")
}

/// 旧版全局路径（迁移用）：`data_dir/downloads/downloads.json`
fn legacy_downloads_json(data_dir: &Path) -> PathBuf {
    data_dir.join("downloads").join("downloads.json")
}

impl AccountDownloadData {
    fn load_from_path(&mut self, path: &Path) -> bool {
        if !path.exists() {
            return false;
        }
        let Ok(content) = fs::read_to_string(path) else {
            return false;
        };

        if let Ok(data) = serde_json::from_str::<PersistedData>(&content) {
            let looks_new = data.items.is_empty()
                || data.items.values().any(|it| !it.remote_id.is_empty())
                || data
                    .items
                    .keys()
                    .any(|k| k.contains(':') || !k.chars().all(|c| c.is_ascii_digit()));
            if looks_new {
                self.items = data.items;
                self.show_hidden = data.show_hidden;
                self.show_auto_photos = data.show_auto_photos;
                self.rebuild_session_map();
                return true;
            }
        }

        if let Ok(old) = serde_json::from_str::<PersistedDataV1>(&content) {
            self.show_hidden = old.show_hidden;
            self.show_auto_photos = old.show_auto_photos;
            for (fid, o) in old.items {
                let remote_id = format!("legacy:{}", fid);
                self.items.insert(
                    remote_id.clone(),
                    DownloadItem {
                        remote_id,
                        session_file_id: Some(fid),
                        file_id: fid,
                        file_name: o.file_name,
                        chat_title: o.chat_title,
                        chat_id: o.chat_id,
                        message_id: o.message_id,
                        total_size: o.total_size,
                        downloaded_size: o.downloaded_size,
                        progress: o.progress,
                        is_paused: o.is_paused,
                        is_completed: o.is_completed,
                        local_path: o.local_path,
                        thumbnail_data_url: o.thumbnail_data_url,
                        file_type: o.file_type,
                        is_generic: o.is_generic,
                        hidden_category: o.hidden_category,
                        is_auto_photo: o.is_auto_photo,
                        is_streaming: o.is_streaming,
                        tags: Vec::new(),
                        source_label: None,
                        dismissed: o.dismissed,
                        is_upload: o.is_upload,
                        created_at: o.created_at,
                    },
                );
            }
            self.rebuild_session_map();
            return true;
        }
        false
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

    fn save_to_path(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let data = PersistedData {
            items: self.items.clone(),
            show_hidden: self.show_hidden,
            show_auto_photos: self.show_auto_photos,
        };
        if let Ok(content) = serde_json::to_string_pretty(&data) {
            fs::write(path, content).ok();
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

/// 多账户下载存储：每个账户一份独立 downloads.json。
pub struct DownloadStore {
    data_dir: PathBuf,
    active_account: i64,
    accounts: HashMap<i64, AccountDownloadData>,
    /// 旧全局 json 是否已迁移到某个账户
    legacy_migrated: bool,
}

#[allow(dead_code)]
impl DownloadStore {
    pub fn new(data_dir: PathBuf, active_account: i64) -> Self {
        let mut store = Self {
            data_dir,
            active_account,
            accounts: HashMap::new(),
            legacy_migrated: false,
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

    fn path_for(&self, account_id: i64) -> PathBuf {
        account_downloads_json(&self.data_dir, account_id)
    }

    /// 懒加载账户数据；首次遇到旧全局 json 时迁入活动账户
    fn ensure_loaded(&mut self, account_id: i64) {
        if self.accounts.contains_key(&account_id) {
            return;
        }
        let path = self.path_for(account_id);
        let mut data = AccountDownloadData::default();
        let loaded = data.load_from_path(&path);

        if !loaded && !self.legacy_migrated {
            let legacy = legacy_downloads_json(&self.data_dir);
            if legacy.exists() && data.load_from_path(&legacy) {
                data.save_to_path(&path);
                // 旧文件改名备份，避免再次误迁移
                let _ = fs::rename(&legacy, legacy.with_extension("json.migrated"));
                self.legacy_migrated = true;
            }
        }

        self.accounts.insert(account_id, data);
    }

    fn data_mut(&mut self, account_id: i64) -> &mut AccountDownloadData {
        self.ensure_loaded(account_id);
        self.accounts.get_mut(&account_id).expect("account download data loaded")
    }

    fn data(&mut self, account_id: i64) -> &mut AccountDownloadData {
        self.data_mut(account_id)
    }

    fn save(&mut self, account_id: i64) {
        let path = self.path_for(account_id);
        if let Some(d) = self.accounts.get(&account_id) {
            d.save_to_path(&path);
        }
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
                !item.is_generic
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
                !item.dismissed
                    && (d.show_hidden || !item.is_generic)
                    && (d.show_auto_photos || !item.is_auto_photo)
            })
            .cloned()
            .collect();
        items.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then_with(|| b.file_id.cmp(&a.file_id))
        });
        items
    }

    pub fn has_hidden_active(&self) -> bool {
        let Some(d) = self.accounts.get(&self.active_account) else {
            return false;
        };
        d.items.values().any(|item| {
            (item.is_generic || item.is_auto_photo) && !item.is_completed && !item.dismissed
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
    ) -> String {
        let acct = account_id.unwrap_or(self.active_account);
        let rid = derive_remote_id(remote_id.as_deref(), session_file_id);

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
                if let Some(mut item) = self.data_mut(acct).items.remove(&old_key) {
                    item.remote_id = rid.clone();
                    item.session_file_id = Some(session_file_id);
                    item.file_id = session_file_id;
                    self.data_mut(acct).items.insert(rid.clone(), item);
                }
                rid
            } else {
                rid
            }
        } else {
            rid
        };

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
        );
        self.data_mut(acct)
            .session_map
            .insert(session_file_id, use_key.clone());
        self.save(acct);
        use_key
    }

    #[allow(clippy::too_many_arguments)]
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
    ) {
        let d = self.data_mut(account_id);
        if let Some(existing) = d.items.get(key) {
            if !existing.dismissed {
                let is_fallback = existing.file_type == "other" && existing.is_generic;
                let mut updated = existing.clone();
                if is_fallback {
                    updated.file_type = file_type;
                    updated.is_generic = is_generic;
                    updated.hidden_category = hidden_category;
                    updated.is_auto_photo = is_auto_photo;
                    if tags.as_ref().map(|t| !t.is_empty()).unwrap_or(false) {
                        updated.tags = tags.unwrap_or_default();
                    }
                } else if tags.as_ref().map(|t| !t.is_empty()).unwrap_or(false) {
                    let mut merged = updated.tags.clone();
                    for t in tags.unwrap_or_default() {
                        if !merged.contains(&t) {
                            merged.push(t);
                        }
                    }
                    updated.tags = merged;
                }
                if updated.file_name.starts_with("文件 #") && !file_name.is_empty() {
                    updated.file_name = file_name;
                }
                if updated.chat_title.is_empty() && !chat_title.is_empty() {
                    updated.chat_title = chat_title;
                }
                if updated.thumbnail_data_url.is_none() {
                    updated.thumbnail_data_url = thumbnail_data_url;
                }
                if source_label.is_some() {
                    updated.source_label = source_label;
                }
                if updated.total_size == 0 && total_size > 0 {
                    updated.total_size = total_size;
                }
                updated.is_streaming = updated.is_streaming || is_streaming;
                updated.session_file_id = Some(session_file_id);
                updated.file_id = session_file_id;
                updated.remote_id = key.to_string();
                if updated.created_at == 0 {
                    updated.created_at = now_ms();
                }
                d.items.insert(key.to_string(), updated);
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
            },
        );
    }

    /// updateFile 时：绑定 session → 条目键（在指定账户下）。
    ///
    /// TDLib file.id 仅会话内有效，可能被不同文件复用。有 remote.id 时必须以其
    /// 为准重绑 session_map；否则沿用旧绑定会把进度/路径写到错误条目（媒体乱串）。
    pub fn bind_session_key(
        &mut self,
        account_id: i64,
        session_file_id: i32,
        remote_id: Option<&str>,
    ) -> String {
        let key = derive_remote_id(remote_id, session_file_id);
        let has_remote = remote_id.map(|r| !r.is_empty()).unwrap_or(false);
        let d = self.data_mut(account_id);

        if has_remote {
            if d.session_map.get(&session_file_id) != Some(&key) {
                d.session_map.insert(session_file_id, key.clone());
            }
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
            } else {
                0.0
            };
            item.is_paused = !is_downloading_active && !is_downloading_completed;
            item.is_completed = is_downloading_completed;
            if is_downloading_completed {
                item.created_at = now_ms();
                if let Some(path) = local_path {
                    if !path.is_empty() {
                        item.local_path = Some(path);
                    }
                }
            }
        }
        self.save(acct);
    }

    pub fn set_paused(&mut self, account_id: Option<i64>, id: &str, paused: bool) -> bool {
        let acct = account_id.unwrap_or(self.active_account);
        let key = self.data(acct).resolve_key(id);
        let d = self.data_mut(acct);
        if let Some(item) = d.items.get_mut(&key) {
            item.is_paused = paused;
            self.save(acct);
            true
        } else {
            false
        }
    }

    pub fn dismiss_item(&mut self, account_id: Option<i64>, id: &str) -> bool {
        let acct = account_id.unwrap_or(self.active_account);
        let key = self.data(acct).resolve_key(id);
        let d = self.data_mut(acct);
        if let Some(item) = d.items.get_mut(&key) {
            item.dismissed = true;
            self.save(acct);
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
        self.save(acct);
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
        self.save(acct);
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
        self.save(acct);
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

    /// 账户登出：丢弃内存缓存（磁盘已随账户目录删除）
    pub fn drop_account(&mut self, account_id: i64) {
        self.accounts.remove(&account_id);
    }
}
