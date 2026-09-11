//! Windows Toast 身份与原生通知。
//!
//! `tauri-plugin-notification` 在 `target/debug` / `target/release` 下故意不设置
//! `System.AppUserModel.ID`，导致开发态 Toast 归属到启动 shell（常见显示为
//! 「Windows PowerShell」）。这里自行发送通知并始终带 AUMID；同时在开始菜单
//! 注册带 AUMID 的快捷方式，让 Windows 能解析出应用名与图标。
//!
//! 另：notify-rust 在 Windows 上未设置 app_id 时会回落到
//! `Toast::POWERSHELL_APP_ID`，这正是归属显示为 PowerShell 的直接原因。

use std::path::PathBuf;

/// 与 tauri.conf.json 的 identifier 保持一致
pub const APP_AUMID: &str = "com.xiaoqvan.tdeeeg";
pub const APP_DISPLAY_NAME: &str = "tdeeeg";

fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// 开始菜单快捷方式路径（用户级）
fn start_menu_lnk() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let mut p = PathBuf::from(appdata);
    p.push("Microsoft");
    p.push("Windows");
    p.push("Start Menu");
    p.push("Programs");
    p.push(format!("{APP_DISPLAY_NAME}.lnk"));
    Some(p)
}

/// 创建/更新带 AppUserModel.ID 的开始菜单快捷方式（幂等）。
#[cfg(target_os = "windows")]
pub fn ensure_toast_shortcut(exe: &std::path::Path) -> Result<(), String> {
    let lnk = start_menu_lnk().ok_or_else(|| "APPDATA not found".to_string())?;
    let lnk_str = lnk.to_string_lossy().replace('\'', "''");
    let exe_str = exe.to_string_lossy().replace('\'', "''");
    let aumid = APP_AUMID;
    let name = APP_DISPLAY_NAME;

    // PowerShell + C# COM：WScript.Shell 建 .lnk，再经 IPropertyStore 写入
    // System.AppUserModel.ID（fmtid 9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3, pid 5）。
    // 注意：Add-Type 默认不引用 Microsoft.CSharp，因此不能用 dynamic，改用反射调用 COM。
    let script = format!(
        r#"$ErrorActionPreference = 'Stop'
$exe = '{exe}'
$lnk = '{lnk}'
$aumid = '{aumid}'
$name = '{name}'
$dir = Split-Path -Parent $lnk
if (-not (Test-Path -LiteralPath $dir)) {{ New-Item -ItemType Directory -Path $dir | Out-Null }}

$src = @'
using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {{
    [PreserveSig] int GetCount(out uint cProps);
    [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY pkey);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    [PreserveSig] int Commit();
}}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PROPERTYKEY {{
    public Guid fmtid;
    public uint pid;
}}

[StructLayout(LayoutKind.Sequential)]
public struct PROPVARIANT {{
    public ushort vt;
    public ushort wReserved1, wReserved2, wReserved3;
    public IntPtr pointerValue;
    public int int64Value;
}}

public static class AumidShortcut {{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHGetPropertyStoreFromParsingName(
        string path, IntPtr pbc, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppv);

    public static void Create(string exePath, string lnkPath, string aumid, string displayName) {{
        // WScript.Shell via reflection — no dynamic / Microsoft.CSharp
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) throw new InvalidOperationException("WScript.Shell ProgID not found");
        object shell = Activator.CreateInstance(shellType);
        object sc;
        try {{
            sc = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null, shell, new object[] {{ lnkPath }});
        }} catch {{
            Marshal.FinalReleaseComObject(shell);
            throw;
        }}

        Type scType = sc.GetType();
        scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] {{ exePath }});
        scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] {{ Path.GetDirectoryName(exePath) }});
        scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] {{ exePath + ",0" }});
        scType.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] {{ displayName }});
        scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
        Marshal.FinalReleaseComObject(sc);
        Marshal.FinalReleaseComObject(shell);

        Guid iid = typeof(IPropertyStore).GUID;
        object storeObj;
        SHGetPropertyStoreFromParsingName(lnkPath, IntPtr.Zero, ref iid, out storeObj);
        IPropertyStore store = (IPropertyStore)storeObj;
        PROPERTYKEY key = new PROPERTYKEY {{
            fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
            pid = 5
        }};
        PROPVARIANT val = new PROPVARIANT();
        val.vt = 31; // VT_LPWSTR
        val.pointerValue = Marshal.StringToCoTaskMemUni(aumid);
        try {{
            int hr = store.SetValue(ref key, ref val);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
            hr = store.Commit();
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        }} finally {{
            if (val.pointerValue != IntPtr.Zero) Marshal.ZeroFreeCoTaskMemUnicode(val.pointerValue);
            Marshal.FinalReleaseComObject(store);
        }}
    }}
}}
'@

Add-Type -TypeDefinition $src -Language CSharp
[AumidShortcut]::Create($exe, $lnk, $aumid, $name)
Write-Output OK
"#,
        exe = exe_str,
        lnk = lnk_str,
        aumid = aumid,
        name = name,
    );

    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| format!("spawn powershell failed: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "create aumid shortcut failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_toast_shortcut(_exe: &std::path::Path) -> Result<(), String> {
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
    // 先注册开始菜单身份，避免 AUMID 无主导致 Toast 被吞或归属异常
    if is_windows() {
        if let Ok(exe) = tauri::utils::platform::current_exe() {
            let _ = ensure_toast_shortcut(&exe);
        }
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
    let Ok(exe) = tauri::utils::platform::current_exe() else {
        return;
    };
    if let Err(e) = ensure_toast_shortcut(&exe) {
        eprintln!("[toast] ensure shortcut failed: {e}");
    }
}
