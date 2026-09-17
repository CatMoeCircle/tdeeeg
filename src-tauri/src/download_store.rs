use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

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
    /// 兼容字段：当前会话 file_id；无会话时为 0。前端 TDLib 相关操作仍可读取此字段。
    #[serde(default)]
    #[allow(dead_code)]
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
    pub progress: f64, // 0~1
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
    /// 通用资源标记（贴纸/emoji/头像等），默认隐藏且不计入红点
    #[serde(default)]
    pub is_generic: bool,
    /// 通用资源的细分类别（遗留字段，标签系统 tags 优先）
    #[serde(default)]
    pub hidden_category: Option<String>,
    #[serde(default)]
    pub is_auto_photo: bool,
    #[serde(default)]
    pub is_streaming: bool,
    /// 多标签：视频/图片/缩略图/自动下载/流式传输/用户头像/…
    #[serde(default)]
    pub tags: Vec<String>,
    /// 来源补充展示：用户 / 贴纸集 / emoji 集 / 资料页 等
    #[serde(default)]
    pub source_label: Option<String>,
    /// 在下载管理器中已手动关闭/移除
    #[serde(default)]
    pub dismissed: bool,
    #[serde(default)]
    pub is_upload: bool,
    #[serde(default)]
    pub created_at: i64,
}

/// 当前 Unix 毫秒时间戳
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 稳定主键派生：优先 remote.id；为空则回退 session 键
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

/// 旧版持久化格式（以 i32 file_id 为键），用于迁移
#[derive(Debug, Clone, Deserialize)]
struct PersistedDataV1 {
    items: HashMap<i32, DownloadItemV1>,
    #[serde(default)]
    show_hidden: bool,
    #[serde(default)]
    show_auto_photos: bool,
}

/// 旧版 DownloadItem（无 remote_id/tags，file_id 即主键）
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

pub struct DownloadStore {
    /// key = remote_id（稳定主键）
    items: HashMap<String, DownloadItem>,
    /// 当前会话 file.id → remote_id，供 updateFile 进度回写
    session_map: HashMap<i32, String>,
    storage_path: PathBuf,
    show_hidden: bool,
    show_auto_photos: bool,
    /// 上传任务：key = remote_id（内存态）
    uploads: HashMap<String, DownloadItem>,
    /// 上传会话映射
    upload_session_map: HashMap<i32, String>,
}

#[allow(dead_code)]
impl DownloadStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let storage_dir = data_dir.join("downloads");
        fs::create_dir_all(&storage_dir).ok();
        let storage_path = storage_dir.join("downloads.json");

        let mut store = Self {
            items: HashMap::new(),
            session_map: HashMap::new(),
            storage_path,
            show_hidden: false,
            show_auto_photos: false,
            uploads: HashMap::new(),
            upload_session_map: HashMap::new(),
        };
        store.load_from_disk();
        store
    }

    // ==================== 持久化 ====================

    fn load_from_disk(&mut self) {
        if !self.storage_path.exists() {
            return;
        }
        let Ok(content) = fs::read_to_string(&self.storage_path) else {
            return;
        };

        // 新格式：remote_id 字符串键
        if let Ok(data) = serde_json::from_str::<PersistedData>(&content) {
            // 若 items 的 value 已含非空 remote_id，或 key 形如 session:/legacy:/含字母，则视为新格式
            let looks_new = data.items.is_empty()
                || data
                    .items
                    .values()
                    .any(|it| !it.remote_id.is_empty())
                || data.items.keys().any(|k| k.contains(':') || !k.chars().all(|c| c.is_ascii_digit()));
            if looks_new {
                self.items = data.items;
                self.show_hidden = data.show_hidden;
                self.show_auto_photos = data.show_auto_photos;
                self.rebuild_session_map();
                return;
            }
        }

        // 旧格式迁移：i32 file_id 键
        if let Ok(old) = serde_json::from_str::<PersistedDataV1>(&content) {
            self.show_hidden = old.show_hidden;
            self.show_auto_photos = old.show_auto_photos;
            for (fid, o) in old.items {
                let remote_id = format!("legacy:{}", fid);
                let item = DownloadItem {
                    remote_id: remote_id.clone(),
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
                };
                self.items.insert(remote_id, item);
            }
            self.save_to_disk();
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

    fn save_to_disk(&self) {
        let data = PersistedData {
            items: self.items.clone(),
            show_hidden: self.show_hidden,
            show_auto_photos: self.show_auto_photos,
        };
        if let Ok(content) = serde_json::to_string_pretty(&data) {
            fs::write(&self.storage_path, content).ok();
        }
    }

    /// 解析查找键：优先 session_map，其次直接把入参当 remote_id
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

    /// updateFile 时：根据 session file.id + remote.id 绑定/解析条目键
    pub fn bind_session_key(&mut self, session_file_id: i32, remote_id: Option<&str>) -> String {
        let key = derive_remote_id(remote_id, session_file_id);
        // 若该 session 已映射到别的键（例如 remote.id 后补），保持已有键优先
        if let Some(existing) = self.session_map.get(&session_file_id) {
            return existing.clone();
        }
        if self.items.contains_key(&key) {
            if let Some(item) = self.items.get_mut(&key) {
                item.session_file_id = Some(session_file_id);
                item.file_id = session_file_id;
                if item.remote_id.is_empty() {
                    item.remote_id = key.clone();
                }
            }
        }
        self.session_map.insert(session_file_id, key.clone());
        key
    }

    // ==================== 查询 ====================

    pub fn get_all_items(&self) -> Vec<DownloadItem> {
        let mut items: Vec<DownloadItem> = self.items.values().cloned().collect();
        items.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then_with(|| b.file_id.cmp(&a.file_id))
        });
        items
    }

    pub fn get_item(&self, key: &str) -> Option<DownloadItem> {
        let k = self.resolve_key(key);
        self.items.get(&k).cloned()
    }

    pub fn get_active_items(&self) -> Vec<DownloadItem> {
        self.items
            .values()
            .filter(|item| {
                !item.is_generic && !item.is_auto_photo && !item.is_completed && !item.dismissed
            })
            .cloned()
            .collect()
    }

    pub fn get_active_count(&self) -> usize {
        self.get_active_items().len()
    }

    pub fn get_visible_items(&self) -> Vec<DownloadItem> {
        let mut items: Vec<DownloadItem> = self
            .items
            .values()
            .filter(|item| {
                !item.dismissed
                    && (self.show_hidden || !item.is_generic)
                    && (self.show_auto_photos || !item.is_auto_photo)
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

    pub fn get_completed_items(&self) -> Vec<DownloadItem> {
        self.get_visible_items()
            .into_iter()
            .filter(|item| item.is_completed)
            .collect()
    }

    pub fn get_pending_items(&self) -> Vec<DownloadItem> {
        self.get_visible_items()
            .into_iter()
            .filter(|item| !item.is_completed)
            .collect()
    }

    pub fn has_hidden_active(&self) -> bool {
        self.items.values().any(|item| {
            (item.is_generic || item.is_auto_photo) && !item.is_completed && !item.dismissed
        })
    }

    // ==================== 写入操作 ====================

    /// 注册下载项。主键为 remote_id（file.remote.id）；session_file_id 仅作本会话 TDLib 操作。
    #[allow(clippy::too_many_arguments)]
    pub fn register_download(
        &mut self,
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
        let rid = derive_remote_id(remote_id.as_deref(), session_file_id);
        // 会话键冲突：同一 session 曾指向 legacy 键时，尽量迁到带 remote_id 的键
        if let Some(old_key) = self.session_map.get(&session_file_id).cloned() {
            if old_key != rid && !old_key.starts_with("legacy:") && !old_key.starts_with("session:") {
                // 已有稳定键，沿用
                let use_key = old_key;
                self.merge_register(
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
                return use_key;
            } else if old_key != rid {
                // 旧键为 session:/legacy: → 迁移数据到新 remote_id
                if let Some(mut item) = self.items.remove(&old_key) {
                    item.remote_id = rid.clone();
                    item.session_file_id = Some(session_file_id);
                    item.file_id = session_file_id;
                    self.items.insert(rid.clone(), item);
                }
            }
        }

        self.merge_register(
            &rid,
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
        self.session_map.insert(session_file_id, rid.clone());
        rid
    }

    #[allow(clippy::too_many_arguments)]
    fn merge_register(
        &mut self,
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
        if let Some(existing) = self.items.get(key) {
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
                    // 合并标签（去重保序）
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
                self.items.insert(key.to_string(), updated);
                self.save_to_disk();
                return;
            }
        }

        let item = DownloadItem {
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
        };
        self.items.insert(key.to_string(), item);
        self.save_to_disk();
    }

    /// 更新下载进度。`id` 可为 remote_id 或 session file_id。
    pub fn update_progress(
        &mut self,
        id: &str,
        downloaded_size: i64,
        total_size: i64,
        is_downloading_active: bool,
        is_downloading_completed: bool,
        local_path: Option<String>,
    ) {
        let key = self.resolve_key(id);
        if let Some(item) = self.items.get_mut(&key) {
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
            self.save_to_disk();
        }
    }

    pub fn set_paused(&mut self, id: &str, paused: bool) -> bool {
        let key = self.resolve_key(id);
        if let Some(item) = self.items.get_mut(&key) {
            item.is_paused = paused;
            self.save_to_disk();
            true
        } else {
            false
        }
    }

    pub fn dismiss_item(&mut self, id: &str) -> bool {
        let key = self.resolve_key(id);
        if let Some(item) = self.items.get_mut(&key) {
            item.dismissed = true;
            self.save_to_disk();
            true
        } else {
            false
        }
    }

    pub fn clear_completed(&mut self) {
        self.items
            .retain(|_, item| !item.is_completed && !item.dismissed);
        self.save_to_disk();
    }

    pub fn get_show_hidden(&self) -> bool {
        self.show_hidden
    }

    pub fn set_show_hidden(&mut self, value: bool) {
        self.show_hidden = value;
        self.save_to_disk();
    }

    pub fn get_show_auto_photos(&self) -> bool {
        self.show_auto_photos
    }

    pub fn set_show_auto_photos(&mut self, value: bool) {
        self.show_auto_photos = value;
        self.save_to_disk();
    }

    // ==================== 上传任务（仅内存） ====================

    fn find_upload_by_path(&self, local_path: &str) -> Option<String> {
        for (key, item) in &self.uploads {
            if item.local_path.as_deref() == Some(local_path) {
                return Some(key.clone());
            }
        }
        None
    }

    pub fn register_upload(
        &mut self,
        remote_id: Option<String>,
        session_file_id: i32,
        file_name: String,
        file_type: String,
        chat_title: String,
        total_size: i64,
        thumbnail_data_url: Option<String>,
        local_path: Option<String>,
    ) {
        let rid = derive_remote_id(remote_id.as_deref(), session_file_id);

        if let Some(local) = local_path.as_deref() {
            if !local.is_empty() {
                if let Some(existing_key) = self.find_upload_by_path(local) {
                    if existing_key != rid {
                        if let Some(mut existing) = self.uploads.remove(&existing_key) {
                            existing.remote_id = rid.clone();
                            existing.session_file_id = Some(session_file_id);
                            existing.file_id = session_file_id;
                            self.uploads.insert(rid.clone(), existing);
                            self.upload_session_map
                                .insert(session_file_id, rid.clone());
                            return;
                        }
                    }
                }
            }
        }

        if let Some(existing) = self.uploads.get_mut(&rid) {
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
            self.upload_session_map
                .insert(session_file_id, rid.clone());
            return;
        }

        // 上传标签：上传 + 资源类型
        let mut tags = vec!["上传".to_string()];
        match file_type.as_str() {
            "photo" => tags.push("图片".to_string()),
            "video" => tags.push("视频".to_string()),
            "audio" => tags.push("音乐".to_string()),
            "document" => tags.push("文件".to_string()),
            _ => {}
        }

        self.uploads.insert(
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
        self.upload_session_map
            .insert(session_file_id, rid.clone());
    }

    pub fn update_upload_progress(
        &mut self,
        id: &str,
        uploaded_size: i64,
        total_size: i64,
        is_uploading_active: bool,
        is_uploading_completed: bool,
    ) -> Option<DownloadItem> {
        let key = if self.uploads.contains_key(id) {
            id.to_string()
        } else {
            self.upload_session_map
                .get(&id.parse::<i32>().ok()?)
                .cloned()
                .unwrap_or_else(|| id.to_string())
        };
        let item = self.uploads.get_mut(&key)?;
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
        let mut items: Vec<DownloadItem> = self.uploads.values().cloned().collect();
        items.sort_by(|a, b| b.file_id.cmp(&a.file_id));
        items
    }

    pub fn get_upload(&self, id: &str) -> Option<DownloadItem> {
        let key = if self.uploads.contains_key(id) {
            id.to_string()
        } else {
            self.upload_session_map
                .get(&id.parse::<i32>().ok()?)
                .cloned()
                .unwrap_or_else(|| id.to_string())
        };
        self.uploads.get(&key).cloned()
    }

    pub fn dismiss_upload(&mut self, id: &str) -> bool {
        let key = if self.uploads.contains_key(id) {
            id.to_string()
        } else {
            match id.parse::<i32>() {
                Ok(sid) => match self.upload_session_map.get(&sid) {
                    Some(k) => k.clone(),
                    None => id.to_string(),
                },
                Err(_) => id.to_string(),
            }
        };
        if let Some(item) = self.uploads.remove(&key) {
            if let Some(sid) = item.session_file_id {
                self.upload_session_map.remove(&sid);
            }
            return true;
        }
        self.uploads.remove(id).is_some()
    }
}
