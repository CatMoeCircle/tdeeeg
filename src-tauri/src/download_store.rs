use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// 文件类型分类（与前端 DownloadFileType 对应）
pub type DownloadFileType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
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
    /// 通用资源的细分类别（仅当 is_generic 为 true 时有意义），
    /// 用于在下载管理器中区分展示具体是哪类隐藏资源：
    /// - "emoji"        自定义表情（缩略图/完整贴纸）
    /// - "video_cover"  视频封面（缩略图）
    /// - "avatar"       用户/群组头像、个人资料大图、贴纸等
    /// - "story_cover"  动态封面
    /// - "sticker"      贴纸
    /// - "gift"         礼物贴纸
    /// - "music_cover"  音乐封面
    /// - "other"        其他
    #[serde(default)]
    pub hidden_category: Option<String>,
    /// 自动下载图片标记（频道/群组中自动下载的图片），默认隐藏且不计入红点，
    /// 由独立的「显示自动下载图片」开关控制（与通用资源分开）。
    #[serde(default)]
    pub is_auto_photo: bool,
    /// 视频是否为流式传输（边下边播，tdstream://）来源，用于在下载管理器中
    /// 展示「流式传输」标签。
    #[serde(default)]
    pub is_streaming: bool,
    /// 在下载管理器中已手动关闭/移除
    #[serde(default)]
    pub dismissed: bool,
    /// 是否为上传任务（发送中的文件/图片/音乐/视频）。上传记录仅保存在内存，
    /// 不持久化到磁盘；用于下载管理器中独立「上传」区域的进度展示。
    #[serde(default)]
    pub is_upload: bool,
    /// 下载记录时间戳（Unix 毫秒）：注册下载时记录创建时间，下载完成时刷新为
    /// 完成时间。用于下载管理器「最近下载排前」的排序。
    /// file_id 只反映文件在 Telegram 服务器上的创建顺序，不能反映用户下载的时间，
    /// 故不能作为历史记录排序依据。
    #[serde(default)]
    pub created_at: i64,
}

/// 当前 Unix 毫秒时间戳（用于记录下载记录创建/完成时间）。
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedData {
    items: HashMap<i32, DownloadItem>,
    #[serde(default)]
    show_hidden: bool,
    #[serde(default)]
    show_auto_photos: bool,
}

pub struct DownloadStore {
    items: HashMap<i32, DownloadItem>,
    storage_path: PathBuf,
    show_hidden: bool,
    show_auto_photos: bool,
    /// 上传任务集合（仅内存，不持久化）。key 为文件 id。
    uploads: HashMap<i32, DownloadItem>,
}

#[allow(dead_code)]
impl DownloadStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let storage_dir = data_dir.join("downloads");
        fs::create_dir_all(&storage_dir).ok();
        let storage_path = storage_dir.join("downloads.json");

        let mut store = Self {
            items: HashMap::new(),
            storage_path,
            show_hidden: false,
            show_auto_photos: false,
            uploads: HashMap::new(),
        };
        store.load_from_disk();
        store
    }

    // ==================== 持久化 ====================

    fn load_from_disk(&mut self) {
        if !self.storage_path.exists() {
            return;
        }
        match fs::read_to_string(&self.storage_path) {
            Ok(content) => {
                if let Ok(data) = serde_json::from_str::<PersistedData>(&content) {
                    self.items = data.items;
                    self.show_hidden = data.show_hidden;
                    self.show_auto_photos = data.show_auto_photos;
                }
            }
            Err(e) => eprintln!("Failed to load downloads.json: {}", e),
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

    pub fn get_item(&self, file_id: i32) -> Option<DownloadItem> {
        self.items.get(&file_id).cloned()
    }

    /// 非通用资源且非自动下载图片的活跃（进行中/暂停 + 未完成 + 未关闭）下载项
    pub fn get_active_items(&self) -> Vec<DownloadItem> {
        self.items
            .values()
            .filter(|item| {
                !item.is_generic && !item.is_auto_photo && !item.is_completed && !item.dismissed
            })
            .cloned()
            .collect()
    }

    /// 活跃下载数量（排除通用资源）
    pub fn get_active_count(&self) -> usize {
        self.get_active_items().len()
    }

    /// 可见的下载项（根据 show_hidden / show_auto_photos 开关过滤）
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

    /// 已完成且可见的项
    pub fn get_completed_items(&self) -> Vec<DownloadItem> {
        self.get_visible_items()
            .into_iter()
            .filter(|item| item.is_completed)
            .collect()
    }

    /// 进行中或暂停的可见项
    pub fn get_pending_items(&self) -> Vec<DownloadItem> {
        self.get_visible_items()
            .into_iter()
            .filter(|item| !item.is_completed)
            .collect()
    }

    /// 是否有隐藏（通用资源或自动下载图片）的未完成下载
    pub fn has_hidden_active(&self) -> bool {
        self.items.values().any(|item| {
            (item.is_generic || item.is_auto_photo) && !item.is_completed && !item.dismissed
        })
    }

    // ==================== 写入操作 ====================

    /// 注册一个下载项
    /// - `is_generic` 标记是否为隐藏/通用资源（头像、贴纸、表情等），默认不计入红点，
    ///   需在下载管理器中开启"显示隐藏资源"才会展示。
    /// - `hidden_category` 仅当 `is_generic` 为 true 时有意义，用于区分具体隐藏资源类别
    ///   （"emoji" / "video_cover" / "avatar" / "story_cover" / "sticker" / "other"）。
    /// - `is_auto_photo` 标记是否为自动下载图片（频道/群组中自动下载的图片），
    ///   默认隐藏且不计入红点，由独立的"显示自动下载图片"开关控制。
    ///
    /// 若已有条目是由 `updateFile` 自动兜底创建的（`file_type == "other"` 且无类别信息），
    /// 则以本次显式注册的类别/隐藏标记为准进行覆盖，保证自动下载的视频能正常显示、
    /// 自动下载的图片按独立开关隐藏。
    pub fn register_download(
        &mut self,
        file_id: i32,
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
    ) {
        if let Some(existing) = self.items.get(&file_id) {
            if !existing.dismissed {
                // 兜底条目（other/generic）被显式注册覆盖，否则保留已有分类
                let is_fallback = existing.file_type == "other" && existing.is_generic;
                let file_type = if is_fallback {
                    file_type
                } else {
                    existing.file_type.clone()
                };
                let is_generic = if is_fallback {
                    is_generic
                } else {
                    existing.is_generic
                };
                let hidden_category = if is_fallback {
                    hidden_category
                } else {
                    existing.hidden_category.clone()
                };
                let is_auto_photo = if is_fallback {
                    is_auto_photo
                } else {
                    existing.is_auto_photo
                };
                // 更新已有记录中可能缺失的信息
                let updated = DownloadItem {
                    file_name: if existing.file_name.starts_with("文件 #") {
                        file_name
                    } else {
                        existing.file_name.clone()
                    },
                    chat_title: if existing.chat_title.is_empty() {
                        chat_title
                    } else {
                        existing.chat_title.clone()
                    },
                    thumbnail_data_url: existing.thumbnail_data_url.clone().or(thumbnail_data_url),
                    file_type,
                    is_generic,
                    hidden_category,
                    is_auto_photo,
                    is_streaming,
                    // 旧数据缺少 created_at（0）时补上当前时间戳，保证升级后历史记录也能参与时间排序
                    created_at: if existing.created_at > 0 { existing.created_at } else { now_ms() },
                    ..existing.clone()
                };
                self.items.insert(file_id, updated);
                self.save_to_disk();
                return;
            }
        }

        let item = DownloadItem {
            file_id,
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
            dismissed: false,
            is_upload: false,
            created_at: now_ms(),
        };
        self.items.insert(file_id, item);
        self.save_to_disk();
    }

    /// 更新文件下载进度（由 updateFile 事件处理调用）
    pub fn update_progress(
        &mut self,
        file_id: i32,
        downloaded_size: i64,
        total_size: i64,
        is_downloading_active: bool,
        is_downloading_completed: bool,
        local_path: Option<String>,
    ) {
        if let Some(item) = self.items.get_mut(&file_id) {
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
                // 完成时刷新时间戳，使「已完成」历史按最近下载完成的时间排序
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

    /// 暂停/恢复下载（仅更新本地状态，TDLib 调用由调用方处理）
    pub fn set_paused(&mut self, file_id: i32, paused: bool) -> bool {
        if let Some(item) = self.items.get_mut(&file_id) {
            item.is_paused = paused;
            self.save_to_disk();
            true
        } else {
            false
        }
    }

    /// 标记已关闭
    pub fn dismiss_item(&mut self, file_id: i32) -> bool {
        if let Some(item) = self.items.get_mut(&file_id) {
            item.dismissed = true;
            self.save_to_disk();
            true
        } else {
            false
        }
    }

    /// 清除所有已完成/已关闭的项
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

    /// 是否显示自动下载图片（独立的隐藏开关）
    pub fn get_show_auto_photos(&self) -> bool {
        self.show_auto_photos
    }

    pub fn set_show_auto_photos(&mut self, value: bool) {
        self.show_auto_photos = value;
        self.save_to_disk();
    }

    // ==================== 上传任务（仅内存，不持久化） ====================

    /// 按来源本地路径查找是否已有一条上传记录（用于去重）。
    /// 同一源文件可能被 TDLib 以多个 file_id 上传（如原始文件 + 缩略图/封面），
    /// 通过 local_path 去重，避免同一文件在「上传」区出现多次。
    fn find_upload_by_path(&self, local_path: &str) -> Option<i32> {
        for (fid, item) in &self.uploads {
            if item.local_path.as_deref() == Some(local_path) {
                return Some(*fid);
            }
        }
        None
    }

    /// 注册一个上传任务（由 updateFile 事件处理调用），提供文件名与类型，
    /// 供下载管理器「上传」区域展示。
    ///
    /// 以 file_id 为键；若该 file_id 已存在则补充缺失信息。
    /// `local_path` 用于去重：当同一源文件以不同 file_id 触发上传时，
    /// 把已有记录的 file_id 迁移到当前 file_id，避免重复展示。
    pub fn register_upload(
        &mut self,
        file_id: i32,
        file_name: String,
        file_type: String,
        chat_title: String,
        total_size: i64,
        thumbnail_data_url: Option<String>,
        local_path: Option<String>,
    ) {
        // 先按 local_path 去重：同一源文件已存在未完成记录时，迁移 file_id
        if let Some(local) = local_path.as_deref() {
            if !local.is_empty() {
                if let Some(existing_fid) = self.find_upload_by_path(local) {
                    if existing_fid != file_id {
                        if let Some(mut existing) = self.uploads.remove(&existing_fid) {
                            existing.file_id = file_id;
                            self.uploads.insert(file_id, existing);
                            return;
                        }
                    }
                }
            }
        }

        if let Some(existing) = self.uploads.get_mut(&file_id) {
            let is_fallback = existing.file_type == "other";
            let name = if existing.file_name.is_empty() {
                file_name
            } else {
                existing.file_name.clone()
            };
            existing.file_name = name;
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
            return;
        }

        self.uploads.insert(
            file_id,
            DownloadItem {
                file_id,
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
                dismissed: false,
                is_upload: true,
                created_at: now_ms(),
            },
        );
    }

    /// 更新上传进度（由 updateFile 事件处理调用）。
    /// 返回更新后的条目供调用方 emit 给前端；若该任务未注册则返回 None。
    pub fn update_upload_progress(
        &mut self,
        file_id: i32,
        uploaded_size: i64,
        total_size: i64,
        is_uploading_active: bool,
        is_uploading_completed: bool,
    ) -> Option<DownloadItem> {
        let item = self.uploads.get_mut(&file_id)?;
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

    /// 全部上传任务（进行中 + 已完成），按文件 id 倒序
    pub fn get_uploads(&self) -> Vec<DownloadItem> {
        let mut items: Vec<DownloadItem> = self.uploads.values().cloned().collect();
        items.sort_by(|a, b| b.file_id.cmp(&a.file_id));
        items
    }

    /// 获取某个上传任务的展示信息
    pub fn get_upload(&self, file_id: i32) -> Option<DownloadItem> {
        self.uploads.get(&file_id).cloned()
    }

    /// 手动关闭/移除一个上传任务（保留直到用户手动关闭）
    pub fn dismiss_upload(&mut self, file_id: i32) -> bool {
        self.uploads.remove(&file_id).is_some()
    }
}
