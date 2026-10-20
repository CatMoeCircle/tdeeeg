//! 数据存储位置查询与目录迁移（AppData ↔ 便携目录）。

use super::lifecycle::shutdown_all_clients;
use super::AppState;
use serde_json::json;
use std::path::Path;
use tauri::{Emitter, Manager, State};

fn emit_migration_progress(
    app: &tauri::AppHandle,
    percent: u32,
    stage: &str,
    message: impl std::fmt::Display,
) {
    let _ = app.emit(
        "data-migration-progress",
        json!({ "percent": percent, "stage": stage, "message": message.to_string() }),
    );
}

/// 递归统计目录大小。
fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                dir_size(&path)
            } else {
                path.metadata().map(|m| m.len()).unwrap_or(0)
            }
        })
        .sum()
}

#[tauri::command]
pub fn get_data_location(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<serde_json::Value, String> {
    let mode = crate::system::data_loc::read_mode(&app);
    let current_dir = state.data_dir.clone();
    let appdata_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let portable_dir =
        crate::system::data_loc::resolve_data_dir(&app, crate::system::data_loc::DataMode::Portable)?;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;

    let tdlib_size = dir_size(&current_dir.join("TDLib"));
    // 下载记录 + AI 对话记录都在本地数据库里
    let mut downloads_size = dir_size(&current_dir.join("downloads"));
    for suffix in ["", "-wal", "-shm"] {
        if let Ok(meta) = std::fs::metadata(
            current_dir.join(format!("{}{}", crate::db::DB_FILE, suffix)),
        ) {
            downloads_size += meta.len();
        }
    }

    Ok(json!({
        "mode": mode.as_str(),
        "current_dir": current_dir.to_string_lossy().to_string(),
        "appdata_dir": appdata_dir.to_string_lossy().to_string(),
        "portable_dir": portable_dir.to_string_lossy().to_string(),
        "config_dir": config_dir.to_string_lossy().to_string(),
        "tdlib_size": tdlib_size,
        "downloads_size": downloads_size,
        "total_size": tdlib_size + downloads_size,
    }))
}

fn move_data_tree(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    if dst.exists() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let bak = std::path::PathBuf::from(format!("{}.bak-{}", dst.to_string_lossy(), ts));
        std::fs::rename(dst, &bak)
            .map_err(|e| format!("备份目标目录失败 {}: {e}", dst.display()))?;
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目标父目录 {}: {e}", parent.display()))?;
    }
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) => copy_and_remove(src, dst)
            .map_err(|copy_err| format!("移动目录失败 {}: {e} / {copy_err}", src.display())),
    }
}

/// 跨盘移动：逐项复制后删除源目录。
fn copy_and_remove(src: &Path, dst: &Path) -> std::io::Result<()> {
    fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            let src_path = entry.path();
            let dst_path = to.join(entry.file_name());
            if src_path.is_dir() {
                copy_dir(&src_path, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }
    copy_dir(src, dst)?;
    std::fs::remove_dir_all(src)
}

/// 迁移数据目录到目标模式，并在完成后重启应用。
#[tauri::command]
pub async fn migrate_data_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mode: String,
) -> Result<(), String> {
    use crate::system::data_loc::DataMode;
    let target_mode = match mode.as_str() {
        "appdata" => DataMode::AppData,
        "portable" => DataMode::Portable,
        other => return Err(format!("未知的存储模式: {other}")),
    };

    let current_mode = crate::system::data_loc::read_mode(&app);
    if current_mode == target_mode {
        return Ok(());
    }
    let target_dir = crate::system::data_loc::resolve_data_dir(&app, target_mode)?;

    emit_migration_progress(&app, 5, "prepare", "准备迁移…");
    emit_migration_progress(&app, 10, "close", "正在关闭所有账户的 TDLib，等待资源释放…");
    shutdown_all_clients(state.inner()).await?;
    emit_migration_progress(&app, 40, "released", "资源已释放，开始移动数据…");

    let src_dir = state.data_dir.clone();
    let mut failed = None::<String>;

    emit_migration_progress(&app, 50, "move", "移动 TDLib 数据库…");
    if let Err(e) = move_data_tree(&src_dir.join("TDLib"), &target_dir.join("TDLib")) {
        failed = Some(e);
    }
    emit_migration_progress(&app, 75, "move", "移动下载记录…");
    if let Err(e) = move_data_tree(&src_dir.join("downloads"), &target_dir.join("downloads")) {
        if failed.is_none() {
            failed = Some(e);
        }
    }

    // SQLite 数据库此时仍被本进程打开：先 checkpoint 再复制，进程重启后使用副本。
    emit_migration_progress(&app, 82, "move", "移动数据库…");
    let _ = state.db.conn().execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    for suffix in ["", "-wal", "-shm"] {
        let src = src_dir.join(format!("{}{}", crate::db::DB_FILE, suffix));
        if !src.exists() {
            continue;
        }
        let dst = target_dir.join(format!("{}{}", crate::db::DB_FILE, suffix));
        if let Err(e) = std::fs::copy(&src, &dst) {
            failed = Some(format!("复制数据库失败 {}: {e}", src.display()));
            break;
        }
        // 文件仍被占用，删不掉也无所谓：配置已指向新目录，重启后用副本。
        let _ = std::fs::remove_file(&src);
    }

    emit_migration_progress(&app, 90, "config", "保存存储位置配置…");
    if let Some(err) = failed {
        emit_migration_progress(&app, 95, "error", format!("迁移出错：{err}"));
        let _ = crate::system::data_loc::write_mode(&app, current_mode);
    } else if let Err(e) = crate::system::data_loc::write_mode(&app, target_mode) {
        emit_migration_progress(&app, 95, "error", format!("保存配置失败：{e}"));
        let _ = crate::system::data_loc::write_mode(&app, current_mode);
    } else {
        emit_migration_progress(&app, 100, "done", "迁移完成，正在重启应用…");
    }

    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    app.restart();
}
