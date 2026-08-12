//! 数据存储位置管理
//!
//! 支持两种数据存放位置：
//! - `AppData`（默认）：`app_data_dir()`（Windows 下为 %APPDATA%\<identifier>）
//! - `Portable`（应用自带目录）：可执行文件同级目录，便携式、随应用一起移动
//!
//! 选择结果持久化在 `app_config_dir/data_location.json`（该文件始终在系统配置目录，
//! 不会随数据目录移动）。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "data_location.json";

/// 数据存储模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataMode {
    /// 系统 AppData 目录（默认）
    AppData,
    /// 应用自带目录（可执行文件同级）
    Portable,
}

impl DataMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            DataMode::AppData => "appdata",
            DataMode::Portable => "portable",
        }
    }
}

/// 存储位置配置（当前激活的模式）
#[derive(Debug, Serialize, Deserialize)]
struct DataLocationConfig {
    mode: DataMode,
}

impl Default for DataLocationConfig {
    fn default() -> Self {
        Self {
            mode: DataMode::AppData,
        }
    }
}

/// 读取当前激活的数据模式（配置不存在时返回默认 AppData）。
pub fn read_mode<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> DataMode {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return DataMode::AppData;
    };
    let config_path = config_dir.join(CONFIG_FILE);
    let Ok(content) = std::fs::read_to_string(&config_path) else {
        return DataMode::AppData;
    };
    serde_json::from_str::<DataLocationConfig>(&content)
        .map(|c| c.mode)
        .unwrap_or(DataMode::AppData)
}

/// 持久化当前激活的数据模式。
pub fn write_mode<R: tauri::Runtime>(app: &tauri::AppHandle<R>, mode: DataMode) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("无法创建配置目录: {e}"))?;
    let config_path = config_dir.join(CONFIG_FILE);
    let content = serde_json::to_string_pretty(&DataLocationConfig { mode })
        .map_err(|e| format!("序列化配置失败: {e}"))?;
    std::fs::write(&config_path, content).map_err(|e| format!("写入配置失败: {e}"))
}

/// 根据模式解析数据根目录：
/// - AppData → `app_data_dir()`
/// - Portable → 可执行文件所在目录
pub fn resolve_data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>, mode: DataMode) -> Result<PathBuf, String> {
    match mode {
        DataMode::AppData => app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法定位 AppData 目录: {e}")),
        DataMode::Portable => {
            let exe = std::env::current_exe().map_err(|e| format!("无法定位可执行文件: {e}"))?;
            let dir = exe
                .parent()
                .ok_or_else(|| "无法定位可执行文件所在目录".to_string())?
                .to_path_buf();
            if !dir.is_dir() {
                return Err("可执行文件所在目录不存在".to_string());
            }
            Ok(dir)
        }
    }
}

/// 读取当前激活的数据根目录（供 setup / init 调用）。
pub fn resolve_current_data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let mode = read_mode(app);
    resolve_data_dir(app, mode)
}
