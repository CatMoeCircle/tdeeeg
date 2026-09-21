//! setTdlibParameters 用的设备信息采集（对齐 Unigram：真实机型 + 显式系统版本）。

use std::sync::OnceLock;

/// Telegram 会话里显示的机型名。
pub fn device_model() -> &'static str {
    static MODEL: OnceLock<String> = OnceLock::new();
    MODEL.get_or_init(detect_device_model)
}

/// Telegram 会话里显示的系统版本，例如 `Windows 11`。
pub fn system_version() -> &'static str {
    static VERSION: OnceLock<String> = OnceLock::new();
    VERSION.get_or_init(detect_system_version)
}

fn is_placeholder(value: &str) -> bool {
    let t = value.trim();
    t.is_empty()
        || t.eq_ignore_ascii_case("System manufacturer")
        || t.eq_ignore_ascii_case("System Product Name")
        || t.eq_ignore_ascii_case("SKU")
        || t.eq_ignore_ascii_case("To be filled by O.E.M.")
        || t.eq_ignore_ascii_case("Default string")
        || t.eq_ignore_ascii_case("Unknown")
}

fn detect_device_model() -> String {
    detect_device_model_platform()
        .map(|m| m.trim().to_string())
        .filter(|m| !is_placeholder(m))
        .unwrap_or_else(|| "Desktop".to_string())
}

#[cfg(windows)]
fn detect_device_model_platform() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let bios = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"HARDWARE\DESCRIPTION\System\BIOS")
        .ok()?;
    let product: String = bios.get_value("SystemProductName").unwrap_or_default();
    let manufacturer: String = bios.get_value("SystemManufacturer").unwrap_or_default();
    let family: String = bios.get_value("SystemFamily").unwrap_or_default();

    let product = product.trim();
    let manufacturer = manufacturer.trim();
    let family = family.trim();

    if !is_placeholder(product) {
        if !is_placeholder(manufacturer)
            && !product
                .to_ascii_lowercase()
                .contains(&manufacturer.to_ascii_lowercase())
        {
            return Some(format!("{manufacturer} {product}"));
        }
        return Some(product.to_string());
    }
    if !is_placeholder(family) {
        return Some(family.to_string());
    }
    if !is_placeholder(manufacturer) {
        return Some(manufacturer.to_string());
    }
    None
}

#[cfg(not(windows))]
fn detect_device_model_platform() -> Option<String> {
    None
}

fn detect_system_version() -> String {
    detect_system_version_platform().unwrap_or_else(fallback_system_version)
}

#[cfg(windows)]
fn detect_system_version_platform() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let cv = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .ok()?;

    let read_u32 = |name: &str| -> Option<u32> {
        if let Ok(v) = cv.get_value::<u32, _>(name) {
            return Some(v);
        }
        cv.get_value::<String, _>(name)
            .ok()
            .and_then(|s| s.trim().parse().ok())
    };

    let build = read_u32("CurrentBuildNumber").unwrap_or(0);
    let major_raw = read_u32("CurrentMajorVersionNumber").unwrap_or(10);

    // Windows 11 的 CurrentMajorVersionNumber 仍是 10，需按 build 区分
    // https://learn.microsoft.com/windows/apps/winui/winui3/
    let major = if build >= 22000 {
        11
    } else if major_raw == 0 {
        10
    } else {
        major_raw
    };

    Some(format!("Windows {major}"))
}

#[cfg(target_os = "macos")]
fn detect_system_version_platform() -> Option<String> {
    let out = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if ver.is_empty() {
        return None;
    }
    Some(format!("macOS {ver}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn detect_system_version_platform() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if let Some(v) = line.strip_prefix("PRETTY_NAME=") {
            let v = v.trim().trim_matches('"');
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

#[cfg(not(any(windows, unix)))]
fn detect_system_version_platform() -> Option<String> {
    None
}

fn fallback_system_version() -> String {
    match std::env::consts::OS {
        "windows" => "Windows".into(),
        "macos" => "macOS".into(),
        "linux" => "Linux".into(),
        other => other.to_string(),
    }
}
