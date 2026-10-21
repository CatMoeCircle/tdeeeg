//! 系统钥匙串（AI 的 API Key 等敏感串只存这里，不落 JSON）。
//!
//! 原先用 `tauri-plugin-keyring-store`，但它依赖 Tauri 2；这里直接用同一套
//! `keyring-core` + 平台原生后端。服务名沿用应用 identifier，
//! 已保存的凭据仍然读得到。

use std::sync::OnceLock;

use keyring_core::Entry;

static INIT: OnceLock<Result<(), String>> = OnceLock::new();

/// 每个进程只注册一次平台后端。
fn ensure_init() -> Result<(), String> {
    INIT.get_or_init(|| {
        #[cfg(target_os = "windows")]
        keyring_core::set_default_store(
            windows_native_keyring_store::Store::new()
                .map_err(|e| format!("Windows 凭据管理器初始化失败: {e}"))?,
        );
        #[cfg(target_os = "macos")]
        keyring_core::set_default_store(
            apple_native_keyring_store::keychain::Store::new()
                .map_err(|e| format!("macOS 钥匙串初始化失败: {e}"))?,
        );
        #[cfg(target_os = "linux")]
        keyring_core::set_default_store(
            dbus_secret_service_keyring_store::Store::new()
                .map_err(|e| format!("Linux Secret Service 初始化失败: {e}"))?,
        );
        Ok(())
    })
    .clone()
}

fn entry<R: tauri::Runtime>(app: &tauri::AppHandle<R>, account: &str) -> Result<Entry, String> {
    ensure_init()?;
    Entry::new(&app.config().identifier, account).map_err(|e| e.to_string())
}

/// 读取凭据；不存在 / 钥匙串不可用时返回 None（调用方按「没设置」处理）。
pub(crate) fn get<R: tauri::Runtime>(app: &tauri::AppHandle<R>, account: &str) -> Option<String> {
    entry(app, account).ok()?.get_password().ok()
}

pub(crate) fn set<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    account: &str,
    secret: &str,
) -> Result<(), String> {
    entry(app, account)?
        .set_password(secret)
        .map_err(|e| e.to_string())
}

/// 删除凭据；不存在也算成功。
pub(crate) fn delete<R: tauri::Runtime>(app: &tauri::AppHandle<R>, account: &str) {
    if let Ok(entry) = entry(app, account) {
        let _ = entry.delete_credential();
    }
}
