//! 下载面板与上传任务命令。

use super::AppState;
use crate::store::download_store::{DownloadItem, DownloadPage};
use tauri::State;

/// 下载面板分页快照：打开面板只取第一页，滚动到底再取下一页。
///
/// - `completed_offset` / `completed_limit`：已完成区偏移与页大小（默认 0 / 30）；
/// - `include_generic` / `include_auto_photos`：前端过滤器开关，决定已完成区是否带出头像/
///   贴纸/emoji/通用缩略图与自动下载图片（它们默认隐藏，却占全表 97%）。
#[tauri::command]
pub fn get_downloads(
    state: State<AppState>,
    completed_offset: Option<usize>,
    completed_limit: Option<usize>,
    include_generic: Option<bool>,
    include_auto_photos: Option<bool>,
) -> Result<DownloadPage, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    let mut page = store.get_page(
        store.active_account(),
        completed_offset.unwrap_or(0),
        completed_limit.unwrap_or(30).clamp(1, 500),
        include_generic.unwrap_or(false),
        include_auto_photos.unwrap_or(false),
    );
    // 面板快照不再下发 `thumbnail_data_url`：base64 data URL 是条目里最大的字段，
    // 前端改用本地本体 / 源消息封面渲染（见 src/utils/downloadThumb.ts）。
    for item in page.active.iter_mut().chain(page.completed.iter_mut()) {
        item.thumbnail_data_url = None;
    }
    Ok(page)
}

#[tauri::command]
pub fn get_download_active_count(state: State<AppState>) -> Result<usize, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_active_count())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn register_download(
    state: State<AppState>,
    remote_id: Option<String>,
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
    tags: Option<Vec<String>>,
    source_label: Option<String>,
) -> Result<(), String> {
    // 写入当前活动账户的独立记录
    state
        .download_store
        .lock()
        .map_err(|e| e.to_string())?
        .register_download(
            None,
            remote_id,
            file_id,
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
    Ok(())
}

/// `key` 可为 remote_id（稳定主键）或当前会话 file_id
#[tauri::command]
pub fn dismiss_download(state: State<AppState>, key: String) -> Result<(), String> {
    state
        .download_store
        .lock()
        .map_err(|e| e.to_string())?
        .dismiss_item(None, &key);
    Ok(())
}

#[tauri::command]
pub fn clear_completed_downloads(state: State<AppState>) -> Result<(), String> {
    state
        .download_store
        .lock()
        .map_err(|e| e.to_string())?
        .clear_completed(None);
    Ok(())
}

#[tauri::command]
pub fn get_show_hidden_downloads(state: State<AppState>) -> Result<bool, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_show_hidden())
}

#[tauri::command]
pub fn set_show_hidden_downloads(state: State<AppState>, value: bool) -> Result<(), String> {
    state
        .download_store
        .lock()
        .map_err(|e| e.to_string())?
        .set_show_hidden(value);
    Ok(())
}

#[tauri::command]
pub fn get_show_auto_photos_downloads(state: State<AppState>) -> Result<bool, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_show_auto_photos())
}

#[tauri::command]
pub fn set_show_auto_photos_downloads(state: State<AppState>, value: bool) -> Result<(), String> {
    state
        .download_store
        .lock()
        .map_err(|e| e.to_string())?
        .set_show_auto_photos(value);
    Ok(())
}

// ==================== 上传任务（发送文件）命令 ====================

#[tauri::command]
pub fn get_uploads(state: State<AppState>) -> Result<Vec<DownloadItem>, String> {
    let store = state.download_store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_uploads())
}

#[tauri::command]
pub fn dismiss_upload(state: State<AppState>, key: String) -> Result<(), String> {
    state
        .download_store
        .lock()
        .map_err(|e| e.to_string())?
        .dismiss_upload(None, &key);
    Ok(())
}
