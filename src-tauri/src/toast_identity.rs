//! Windows Toast 身份与原生通知。
//!
//! `tauri-plugin-notification` 在 `target/debug` / `target/release` 下故意不设置
//! `System.AppUserModel.ID`，导致开发态 Toast 归属到启动 shell（常见显示为
//! 「Windows PowerShell」）。这里自行发送通知并始终带 AUMID。
//!
//! 身份注册分两种情况：
//! - **打包应用（MSIX/AppX）**：AUMID 由 `Package.appxmanifest` 的
//!   `Application Id` 提供，系统在安装时自动注册，这里不做任何事。
//! - **未打包（便携 / 绿色 / 开发态）**：按
//!   [`winrt-notification` 的 `unpackaged_app` 示例][1]，直接写
//!   `HKCU\SOFTWARE\Classes\AppUserModelId\{AUMID}` 注册表项
//!   （`DisplayName` / `IconUri` / `IconBackgroundColor`）。
//!   不要用 PowerShell 建 `.lnk` + `IPropertyStore`——外部进程、慢、且易被杀软拦截。
//!
//! [1]: https://github.com/tauri-apps/winrt-notification/blob/dev/examples/unpackaged_app.rs

/// 与 tauri.conf.json 的 identifier 保持一致。
/// 若将来做 MSIX，`Package.appxmanifest` 的 Application Id 必须与此相同。
pub const APP_AUMID: &str = "com.catmoecircle.tdeeeg";
pub const APP_DISPLAY_NAME: &str = "tdeeeg";

fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// 当前进程是否带包身份（MSIX / AppX / Store 安装）。
///
/// 打包应用的 AUMID 由清单自动注册，不应再写 `AppUserModelId` 注册表。
#[cfg(target_os = "windows")]
fn is_packaged_app() -> bool {
    // kernel32!GetCurrentPackageFullName：有包身份返回 0（ERROR_SUCCESS），
    // 无包身份返回 15700（APPMODEL_ERROR_NO_PACKAGE）。
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentPackageFullName(package_full_name_length: *mut u32, package_full_name: *mut u16) -> i32;
    }

    const APPMODEL_ERROR_NO_PACKAGE: i32 = 15700;
    let mut len: u32 = 0;
    let rc = unsafe { GetCurrentPackageFullName(&mut len, std::ptr::null_mut()) };
    rc != APPMODEL_ERROR_NO_PACKAGE
}

#[cfg(not(target_os = "windows"))]
fn is_packaged_app() -> bool {
    false
}

/// 解析 Toast 头像/应用图标文件路径。
///
/// 优先取可执行文件旁的 PNG/ICO；找不到就回落到 exe 本身（Shell 可从中抽图标）。
#[cfg(target_os = "windows")]
fn resolve_icon_uri() -> String {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["128x128.png", "icon.png", "icon.ico"] {
                let p = dir.join(name);
                if p.is_file() {
                    return p.to_string_lossy().into_owned();
                }
            }
            // Tauri 开发态 / 部分打包布局下的 icons 目录
            let icons = dir.join("icons");
            for name in ["128x128.png", "icon.png", "icon.ico"] {
                let p = icons.join(name);
                if p.is_file() {
                    return p.to_string_lossy().into_owned();
                }
            }
        }
        return exe.to_string_lossy().into_owned();
    }
    String::new()
}

/// 写 `HKCU\SOFTWARE\Classes\AppUserModelId\{AUMID}`（幂等）。
///
/// 与 winrt-notification `unpackaged_app.rs` 相同的键值：
/// `DisplayName` / `IconBackgroundColor` / `IconUri`。
#[cfg(target_os = "windows")]
fn register_aumid_registry(icon_uri: &str) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!(r"SOFTWARE\Classes\AppUserModelId\{APP_AUMID}");
    let (key, _) = hkcu
        .create_subkey(&path)
        .map_err(|e| format!("create AppUserModelId key failed: {e}"))?;

    key.set_value("DisplayName", &APP_DISPLAY_NAME)
        .map_err(|e| format!("set DisplayName failed: {e}"))?;
    // 示例值为 "0"（透明/默认），保持一致
    key.set_value("IconBackgroundColor", &"0")
        .map_err(|e| format!("set IconBackgroundColor failed: {e}"))?;
    if !icon_uri.is_empty() {
        key.set_value("IconUri", &icon_uri)
            .map_err(|e| format!("set IconUri failed: {e}"))?;
    }
    Ok(())
}

/// 未打包时注册 Toast 身份；打包应用直接跳过（清单已自动注册）。
#[cfg(target_os = "windows")]
pub fn ensure_toast_identity() -> Result<(), String> {
    if is_packaged_app() {
        return Ok(());
    }
    let icon_uri = resolve_icon_uri();
    register_aumid_registry(&icon_uri)
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_toast_identity() -> Result<(), String> {
    Ok(())
}

/// 始终带 AUMID 发送系统通知（Unigram 风格：左侧圆形头像 + 简洁两行文案）。
///
/// - `title`：主标题（如「张三 → 李四」或群名）
/// - `body`：副标题（消息内容 / 「您有一条新消息」）
/// - `image`：本地头像绝对路径，作为 appLogoOverride 圆形图标（不是大图）
#[tauri::command]
pub fn show_system_notification(
    title: String,
    body: String,
    image: Option<String>,
    silent: bool,
) -> Result<(), String> {
    if is_windows() {
        // 便携目录可能被移动：发通知前再确一次注册（幂等，开销可忽略）
        let _ = ensure_toast_identity();
        return show_toast_windows(&title, &body, image.as_deref(), silent);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut n = notify_rust::Notification::new();
        n.summary(&title);
        n.body(&body);
        n.appname(APP_DISPLAY_NAME);
        n.app_id(APP_AUMID);
        n.show()
            .map(|_handle| ())
            .map_err(|e| format!("show notification failed: {e}"))
    }
    #[cfg(target_os = "windows")]
    {
        unreachable!()
    }
}

/// Windows Toast：头像走 appLogoOverride（左上圆形），正文用 text1，不用 Hero 大图。
#[cfg(target_os = "windows")]
fn show_toast_windows(
    title: &str,
    body: &str,
    image: Option<&str>,
    silent: bool,
) -> Result<(), String> {
    use std::path::Path;
    use tauri_winrt_notification::{IconCrop, Sound, Toast};

    let mut toast = Toast::new(APP_AUMID)
        .title(title)
        .text1(body)
        .sound(if silent { None } else { Some(Sound::IM) });

    if let Some(path) = image {
        if !path.is_empty() && Path::new(path).is_file() {
            // 左侧圆形头像（Unigram / Telegram 桌面样式）
            toast = toast.icon(Path::new(path), IconCrop::Circular, "");
        }
    }

    toast.show().map_err(|e| format!("show notification failed: {e}"))
}

/// 启动时预注册 Toast 身份（幂等）。
pub fn init_toast_identity() {
    if !is_windows() {
        return;
    }
    if let Err(e) = ensure_toast_identity() {
        eprintln!("[toast] ensure aumid identity failed: {e}");
    }
}
