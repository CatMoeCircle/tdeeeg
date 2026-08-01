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
    /// 在下载管理器中已手动关闭/移除
    #[serde(default)]
    pub dismissed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedData {
    items: HashMap<i32, DownloadItem>,
    #[serde(default)]
    show_hidden: bool,
}

pub struct DownloadStore {
    items: HashMap<i32, DownloadItem>,
    storage_path: PathBuf,
    show_hidden: bool,
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
                }
            }
            Err(e) => eprintln!("Failed to load downloads.json: {}", e),
        }
    }

    fn save_to_disk(&self) {
        let data = PersistedData {
            items: self.items.clone(),
            show_hidden: self.show_hidden,
        };
        if let Ok(content) = serde_json::to_string_pretty(&data) {
            fs::write(&self.storage_path, content).ok();
        }
    }

    // ==================== 查询 ====================

    pub fn get_all_items(&self) -> Vec<DownloadItem> {
        let mut items: Vec<DownloadItem> = self.items.values().cloned().collect();
        items.sort_by(|a, b| b.file_id.cmp(&a.file_id));
        items
    }

    pub fn get_item(&self, file_id: i32) -> Option<DownloadItem> {
        self.items.get(&file_id).cloned()
    }

    /// 非通用资源的活跃（进行中/暂停 + 未完成 + 未关闭）下载项
    pub fn get_active_items(&self) -> Vec<DownloadItem> {
        self.items
            .values()
            .filter(|item| !item.is_generic && !item.is_completed && !item.dismissed)
            .cloned()
            .collect()
    }

    /// 活跃下载数量（排除通用资源）
    pub fn get_active_count(&self) -> usize {
        self.get_active_items().len()
    }

    /// 可见的下载项（根据 show_hidden 开关过滤）
    pub fn get_visible_items(&self) -> Vec<DownloadItem> {
        let mut items: Vec<DownloadItem> = self
            .items
            .values()
            .filter(|item| !item.dismissed && (self.show_hidden || !item.is_generic))
            .cloned()
            .collect();
        items.sort_by(|a, b| b.file_id.cmp(&a.file_id));
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

    /// 是否有隐藏的未完成下载
    pub fn has_hidden_active(&self) -> bool {
        self.items
            .values()
            .any(|item| item.is_generic && !item.is_completed && !item.dismissed)
    }

    // ==================== 写入操作 ====================

    /// 注册一个下载项
    /// `is_generic` 标记是否为隐藏/通用资源（自动下载、头像、贴纸、表情等），
    /// 隐藏资源默认不计入红点，需在下载管理器中开启"显示隐藏资源"才会展示。
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
    ) {
        if let Some(existing) = self.items.get(&file_id) {
            if !existing.dismissed {
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
                    file_type: if existing.file_type == "other" {
                        file_type
                    } else {
                        existing.file_type.clone()
                    },
                    // 一旦被标记为通用资源则保持通用标记（自动下载→手动下载不改变隐藏状态）
                    is_generic: existing.is_generic || is_generic,
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
            dismissed: false,
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
}
