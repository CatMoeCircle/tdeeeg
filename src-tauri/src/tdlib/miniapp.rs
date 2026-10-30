//! Telegram Mini App 宿主：无边框窗口 + HTML 壳标题栏 + 子 webview 装 app（路线 A）。
//!
//! 结构与 Unigram 对齐：窗口无系统标题栏，主 webview 加载本地壳 HTML
//! （`public/miniapp-host.html`，画标题栏：返回/头像/名称/更多/关闭，可随 app 变色），
//! 子 webview（`{label}-app`）从标题栏下方开始，只装 Mini App 页面与 SDK 桥。
//!
//! 打开链路（与 Unigram 一致，TDLib 1.8.69 的 WebApp 协议）：
//! 1. 前端调 `openWebApp`（经 tdlibSend）拿到 `webAppInfo{ launch_id, url }`
//! 2. 前端把最终 URL + launch_id 交给 `open_mini_app` 命令
//! 3. 本模块建无边框窗口 + 壳 webview + 子 webview（注入 SDK 桥，收发事件）
//! 4. app 把数据发到聊天 → `updateWebAppMessageSent{ web_app_launch_id }`
//!    → Rust 关窗口并回执 `closeWebApp`（receive.rs 路由到这里）
//!
//! 通信：
//! - 壳 → Rust：标题栏按钮 invoke `miniapp_back` / `miniapp_close` /
//!   `miniapp_reload` / `miniapp_copy_link`（壳是本地 origin，可 invoke；
//!   子 webview 是远程 origin，默认无 IPC 权限——天然隔离）
//! - Rust → 壳：eval `window.__miniappChrome.update(<json>)` 推送
//!   标题栏状态（名称/头像/返回显隐/背景与前景色）
//! - 页面 → 宿主：SDK 桥（chrome.webview.postMessage），线格式照搬 Unigram：
//!   JSON 数组 `["eventType", "eventDataJson"]`（兼容 SDK 直发 external 的对象格式）
//! - 宿主 → 页面：eval `window.Telegram.WebView.receiveEvent('<name>', <json>)`
//!
//! 安全边界：Mini App 是第三方内容，只在这个独立窗口的**子 webview** 里活动，
//! 不经 Tauri IPC；桥脚本只在顶层文档生效；导航限制在 http(s) 内并拦掉 t.me 链接。

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

use super::AppState;

/// Mini App 窗口 label 前缀（lib.rs 注册窗口状态插件时用来排除这些临时窗口）。
pub(crate) const MINIAPP_WINDOW_LABEL_PREFIX: &str = "miniapp-";

/// 壳标题栏高度（逻辑像素）：子 webview（app）从它下方开始。
const TITLEBAR_HEIGHT_LOGICAL: f64 = 40.0;

/// 窗口 label 序号：launch_id 是 TDLib 侧唯一的，但同一 launch 可能被重复打开，
/// 用自增序号保证 label 永不冲突。
static NEXT_LABEL: AtomicI64 = AtomicI64::new(1);

/// launch_id → 宿主状态。
static APPS: Mutex<BTreeMap<i64, Arc<MiniAppEntry>>> = Mutex::new(BTreeMap::new());

/// 窗口 label → launch_id（窗口关闭事件按 label 反查 entry）。
static LABEL_TO_LAUNCH: Mutex<BTreeMap<String, i64>> = Mutex::new(BTreeMap::new());

/// 一个 Mini App 启动会话的运行时状态。
struct MiniAppEntry {
    /// 窗口 label；子 webview 用 `{label}-shell`（壳）/ `{label}-app`（app）
    label: String,
    url: String,
    title: String,
    session_id: i64,
    launch_id: i64,
    bot_user_id: i64,
    /// 打开按钮的文案（web_app_data_send → sendWebAppData 需要）
    button_text: String,
    /// bot 头像本地路径（壳标题栏显示；空则不显示）
    avatar_path: String,
    /// 打开时从前端拿到的主题参数（0xRRGGBB 整数，theme_changed 下发给页面）
    theme: Value,
    /// 是否已进入关闭流程
    closed: AtomicBool,
    /// 是否已把数据发到聊天（sendWebAppData 只允许一次）
    sent_data: AtomicBool,
    /// web_app_setup_back_button 请求的返回按钮显隐
    back_visible: AtomicBool,
    /// web_app_set_header_color 覆盖（0xRRGGBB）；None = 回退主题默认
    header_color: Mutex<Option<i32>>,
}

/// 前端请求打开一个 Mini App。`request` 字段与 open_mini_app 命令对齐：
/// url / launch_id / bot_user_id / chat_id / button_text / title / theme / avatar_path
#[tauri::command]
pub fn open_mini_app(app: AppHandle, request: serde_json::Value) -> Result<(), String> {
    let url = str_field(&request, "url").unwrap_or_default();
    if url.is_empty() {
        return Err("invalid mini app request: url is required".into());
    }
    // launch_id 来自 openWebApp 返回的 webAppInfo；bot 主 Mini App（getMainWebApp）
    // 没有 launch_id，恒为 0 —— 这种打开不参与 updateWebAppMessageSent 生命周期，
    // 关闭时也不回执 closeWebApp（与 Unigram 一致）。
    let launch_id = i64_field(&request, "launch_id").unwrap_or(0);

    // 同一 launch 重复打开：按正常关闭流程收掉旧的
    if let Some(old) = take_entry(launch_id) {
        close_entry(&app, &old);
    }

    let entry = Arc::new(MiniAppEntry {
        label: format!(
            "{MINIAPP_WINDOW_LABEL_PREFIX}{}",
            NEXT_LABEL.fetch_add(1, Ordering::SeqCst)
        ),
        url,
        title: str_field(&request, "title").unwrap_or_else(|| "Mini App".into()),
        session_id: i64_field(&request, "session_id").unwrap_or_else(|| {
            app.state::<AppState>().active.load(Ordering::SeqCst)
        }),
        launch_id,
        bot_user_id: i64_field(&request, "bot_user_id").unwrap_or(0),
        button_text: str_field(&request, "button_text").unwrap_or_default(),
        avatar_path: str_field(&request, "avatar_path").unwrap_or_default(),
        theme: request.get("theme").cloned().unwrap_or(Value::Null),
        closed: AtomicBool::new(false),
        sent_data: AtomicBool::new(false),
        back_visible: AtomicBool::new(false),
        header_color: Mutex::new(None),
    });
    if let Ok(mut map) = APPS.lock() {
        map.insert(launch_id, entry.clone());
    }
    if let Ok(mut map) = LABEL_TO_LAUNCH.lock() {
        map.insert(entry.label.clone(), launch_id);
    }

    // 建窗口要跟主线程来回一次，放到独立线程里做，别卡住调用方（与 proxy_carrier 一致）
    let app = app.clone();
    std::thread::spawn(move || {
        #[cfg(windows)]
        windows_impl::open(&app, entry);
        #[cfg(not(windows))]
        {
            let _ = entry;
            if let Ok(mut map) = APPS.lock() {
                map.remove(&launch_id);
            }
            let _ = app.emit(
                "miniapp-event",
                json!({ "launch_id": launch_id, "event": "failed", "data": { "message": "Mini App 暂仅支持 Windows（WebView2 桥）" } }),
            );
        }
    });
    Ok(())
}

/// 壳标题栏「返回」按钮 → 页面 back_button_pressed（与 Unigram 一致）。
#[tauri::command]
pub fn miniapp_back(app: AppHandle, launch_id: i64) -> Result<(), String> {
    let Some(entry) = entry_of(launch_id) else {
        return Err("mini app launch not found".into());
    };
    post_event(&app, &entry, "back_button_pressed", &Value::Null);
    Ok(())
}

/// 壳标题栏「关闭」按钮 → 完整收尾（关窗口、closeWebApp、通知前端）。
#[tauri::command]
pub fn miniapp_close(app: AppHandle, launch_id: i64) -> Result<(), String> {
    if let Some(entry) = take_entry(launch_id) {
        close_entry(&app, &entry);
    }
    Ok(())
}

/// 壳标题栏空白处按下 → 系统拖动窗口。壳是覆盖顶部的子 webview，鼠标事件不会
/// 落到父窗口的 WM_NCHITTEST（HTCAPTION），所以由壳主动请求拖动。
#[tauri::command]
pub fn miniapp_start_drag(app: AppHandle, launch_id: i64) -> Result<(), String> {
    let Some(entry) = entry_of(launch_id) else {
        return Err("mini app launch not found".into());
    };
    let Some(window) = app.get_window(&entry.label) else {
        return Err("mini app window not found".into());
    };
    window.start_dragging().map_err(|e| e.to_string())
}

/// 处理 Mini App 相关 update。返回 true 表示已消费（调用方不再下发前端）。
///
/// - `updateWebAppMessageSent`：app 已把数据发到聊天，按 launch_id 关掉对应窗口
///   并回执 closeWebApp（前端不需要看到这条 update）
/// - `updateTrustedMiniAppBots` 走普通 Other 通道到前端，这里不拦截
pub(super) fn handle_update(app_handle: &AppHandle, _session_id: i64, event: &Value) -> bool {
    match event.get("_").and_then(|v| v.as_str()) {
        Some("updateWebAppMessageSent") => {
            let launch_id = i64_of(event.get("web_app_launch_id")).unwrap_or(0);
            if launch_id > 0 {
                if let Some(entry) = take_entry(launch_id) {
                    close_entry(app_handle, &entry);
                }
            }
            true
        }
        _ => false,
    }
}

// ─────────────────── 协议处理 ───────────────────

/// 页面通过桥对象发来的消息 → 按线格式解析 → 分发。
fn on_page_message(app: &AppHandle, entry: &Arc<MiniAppEntry>, payload: &str) {
    if entry.closed.load(Ordering::SeqCst) {
        return;
    }

    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return;
    };
    // 线格式一（我们注入的 proxy 序列化）：["eventType", "eventDataJson"]
    // 线格式二（SDK 直发 external）：{"eventType": ..., "eventData": ...}
    let (name, data) = match value {
        Value::Array(items) if items.len() >= 2 => {
            let name = items[0].as_str().unwrap_or("").to_string();
            let data = items[1]
                .as_str()
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .unwrap_or(Value::Null);
            (name, data)
        }
        Value::Object(map) => {
            let name = map
                .get("eventType")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let data = map.get("eventData").cloned().unwrap_or(Value::Null);
            (name, data)
        }
        _ => return,
    };
    if name.is_empty() {
        return;
    }
    handle_page_event(app, entry, &name, &data);
}

/// 页面事件分发：能自答的（关闭/发数据/主题/视口/标题栏）就地处理，
/// 其余转发给前端（主按钮、开关内联查询等 UI 行为）。
fn handle_page_event(app: &AppHandle, entry: &Arc<MiniAppEntry>, name: &str, data: &Value) {
    match name {
        "web_app_close" => close_entry(app, entry),
        "web_app_data_send" => {
            // 与 Unigram 一致：没有按钮文案就发不了 sendWebAppData，静默忽略；
            // 发送也只允许一次（SDK 允许重复调 sendData，重复会丢消息）
            let text = data.get("data").and_then(|v| v.as_str()).unwrap_or("");
            if !text.is_empty()
                && !entry.button_text.is_empty()
                && !entry.sent_data.swap(true, Ordering::SeqCst)
            {
                send_to_session(
                    app,
                    entry.session_id,
                    json!({
                        "@type": "sendWebAppData",
                        "bot_user_id": entry.bot_user_id,
                        "button_text": entry.button_text,
                        "data": text,
                    }),
                );
                // 数据发出后页面即关闭（Unigram 同款行为）
                close_entry(app, entry);
            }
        }
        "web_app_request_theme" => post_theme(app, entry),
        "web_app_request_viewport" => post_viewport(app, entry),
        // 标题栏事件：更新状态并推给壳 webview 重绘
        "web_app_setup_back_button" => {
            entry
                .back_visible
                .store(
                    data.get("is_visible").and_then(|v| v.as_bool()).unwrap_or(false),
                    Ordering::SeqCst,
                );
            push_chrome(app, entry);
            forward_page_event(app, entry, name, data);
        }
        "web_app_set_header_color" => {
            *entry.header_color.lock().unwrap() = parse_header_color(data, &entry.theme);
            push_chrome(app, entry);
            forward_page_event(app, entry, name, data);
        }
        _ => forward_page_event(app, entry, name, data),
    }
}

fn forward_page_event(app: &AppHandle, entry: &Arc<MiniAppEntry>, name: &str, data: &Value) {
    let _ = app.emit(
        "miniapp-event",
        json!({
            "launch_id": entry.launch_id,
            "event": name,
            "data": data,
        }),
    );
}

/// 收掉一个启动会话：关窗口、回执 closeWebApp、通知前端。
fn close_entry(app: &AppHandle, entry: &Arc<MiniAppEntry>) {
    if entry.closed.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_window(&entry.label) {
        let _ = window.close();
    }
    if entry.launch_id != 0 {
        send_to_session(
            app,
            entry.session_id,
            json!({
                "@type": "closeWebApp",
                "web_app_launch_id": entry.launch_id.to_string(),
            }),
        );
    }
    let _ = app.emit(
        "miniapp-event",
        json!({ "launch_id": entry.launch_id, "event": "closed" }),
    );
    if let Ok(mut map) = APPS.lock() {
        map.remove(&entry.launch_id);
    }
    if let Ok(mut map) = LABEL_TO_LAUNCH.lock() {
        map.remove(&entry.label);
    }
}

/// 宿主 → 页面下行事件：window.Telegram.WebView.receiveEvent(name, json)。
/// 目标是 app 子 webview（`{label}-app`），不是壳。
fn post_event(app: &AppHandle, entry: &Arc<MiniAppEntry>, name: &str, data: &Value) {
    if entry.closed.load(Ordering::SeqCst) {
        return;
    }
    let Some(webview) = app.get_webview(&format!("{}-app", entry.label)) else {
        return;
    };
    let name_json = serde_json::to_string(name).unwrap_or_else(|_| "\"\"".into());
    let data_str = data.to_string();
    let _ = webview.eval(&format!(
        "window.Telegram&&window.Telegram.WebView&&window.Telegram.WebView.receiveEvent({name_json},{data_str});"
    ));
}

/// 主题应答：与 Unigram 一致，theme_changed 的 theme_params 是 JSON 字符串。
fn post_theme(app: &AppHandle, entry: &Arc<MiniAppEntry>) {
    let theme = entry.theme.to_string();
    post_event(app, entry, "theme_changed", &json!({ "theme_params": theme }));
}

/// 视口应答：桌面端恒定稳定态，高度取内容区（窗口高 − 壳标题栏）。
fn post_viewport(app: &AppHandle, entry: &Arc<MiniAppEntry>) {
    let mut height = app
        .get_window(&entry.label)
        .and_then(|w| w.outer_size().ok())
        .map(|s| s.height as f64)
        .unwrap_or(720.0);
    height = (height - TITLEBAR_HEIGHT_LOGICAL).max(0.0);
    post_event(
        app,
        entry,
        "viewport_changed",
        &json!({ "height": height, "is_state_stable": true, "is_expanded": true }),
    );
}

// ─────────────────── 壳标题栏状态 ───────────────────

/// 把标题栏全量状态推给壳 webview（初始加载完成 / 返回显隐 / 头部变色时调用）。
fn push_chrome(app: &AppHandle, entry: &Arc<MiniAppEntry>) {
    let Some(shell) = app.get_webview(&format!("{}-shell", entry.label)) else {
        return;
    };
    let state = build_chrome_state(entry);
    let _ = shell.eval(&format!("window.__miniappChrome&&window.__miniappChrome.update({state});"));
}

fn build_chrome_state(entry: &Arc<MiniAppEntry>) -> Value {
    let (bg, fg) = chrome_colors(entry);
    json!({
        "launchId": entry.launch_id.to_string(),
        "title": entry.title,
        "backVisible": entry.back_visible.load(Ordering::SeqCst),
        "avatar": avatar_data_url(&entry.avatar_path),
        "bg": format!("#{:06X}", bg),
        "fg": format!("#{:06X}", fg),
    })
}

/// 标题栏配色：app 指定的 header 色优先，否则主题默认；文字按亮度取黑/白。
fn chrome_colors(entry: &MiniAppEntry) -> (i32, i32) {
    let bg = entry.header_color.lock().unwrap().unwrap_or_else(|| {
        entry
            .theme
            .get("header_background_color")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .or_else(|| {
                entry
                    .theme
                    .get("background_color")
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32)
            })
            .unwrap_or(0x1E293B)
    });
    let lum = 0.299 * ((bg >> 16) & 0xFF) as f64
        + 0.587 * ((bg >> 8) & 0xFF) as f64
        + 0.114 * (bg & 0xFF) as f64;
    let fg = if lum > 140.0 { 0x000000 } else { 0xFFFFFF };
    (bg, fg)
}

/// 头像 → data URL（壳 <img> 直接显示；文件不存在/读失败返回 None）。
fn avatar_data_url(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let mime = sniff_image_mime(&bytes);
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

fn sniff_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/png"
    }
}

/// web_app_set_header_color：{"color": "#RRGGBB"} 或 {"color_key": "bg_color|..."}。
fn parse_header_color(data: &Value, theme: &Value) -> Option<i32> {
    if let Some(c) = data.get("color").and_then(|v| v.as_str()) {
        return parse_hex_color(c);
    }
    let field = match data.get("color_key").and_then(|v| v.as_str()) {
        Some("bg_color") => Some("background_color"),
        Some("secondary_bg_color") => Some("secondary_background_color"),
        Some("bottom_bar_bg_color") => Some("bottom_bar_background_color"),
        _ => None,
    };
    field
        .and_then(|f| theme.get(f).and_then(|v| v.as_i64()))
        .map(|v| v as i32)
}

fn parse_hex_color(s: &str) -> Option<i32> {
    let h = s.trim_start_matches('#');
    if h.len() == 3 {
        let v = u32::from_str_radix(h, 16).ok()?;
        let r = ((v >> 8) & 0xF) * 0x11;
        let g = ((v >> 4) & 0xF) * 0x11;
        let b = (v & 0xF) * 0x11;
        return Some(((r << 16) | (g << 8) | b) as i32);
    }
    if h.len() == 6 {
        return u32::from_str_radix(h, 16).ok().map(|v| v as i32);
    }
    None
}

// ─────────────────── TDLib 直发 ───────────────────

/// 按 session 向 TDLib 发一条请求（不回执，closeWebApp / sendWebAppData 用）。
/// 与 proxy_carrier::send_to_client 同套路：持有 clients 锁期间指针一定有效。
fn send_to_session(app: &AppHandle, session_id: i64, req: Value) {
    let state = app.state::<AppState>();
    let Ok(shared) = super::shared(&state) else {
        return;
    };
    let Ok(clients) = state.clients.lock() else {
        return;
    };
    let Some(client) = clients.get(&session_id) else {
        return;
    };
    super::receive::send_json(shared.send_fn, client.client, &req);
}

// ─────────────────── 记账 ───────────────────

fn take_entry(launch_id: i64) -> Option<Arc<MiniAppEntry>> {
    APPS.lock()
        .ok()
        .and_then(|mut map| map.remove(&launch_id))
}

/// 只读查询（壳命令用，不摘除记账）。
fn entry_of(launch_id: i64) -> Option<Arc<MiniAppEntry>> {
    APPS.lock()
        .ok()
        .and_then(|map| map.get(&launch_id).cloned())
}

fn str_field(request: &Value, key: &str) -> Option<String> {
    request
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

fn i64_field(request: &Value, key: &str) -> Option<i64> {
    i64_of(request.get(key))
}

/// TDLib 的 int64 在 JSON 里可能是数字也可能是字符串，统一解析。
fn i64_of(v: Option<&Value>) -> Option<i64> {
    v.and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
}

// ─────────────────── Windows（multiwebview）实现 ───────────────────

/// 壳标题栏高度（逻辑像素）。
///
/// 布局：`WindowBuilder` 建无边框窗口（无 webview），再 `add_child` 两个 webview：
/// - `{label}-shell`：本地壳 HTML，铺满窗口，画标题栏（拖拽走 data-tauri-drag-region）
/// - `{label}-app`：Mini App 页面，从标题栏下方开始，注入 SDK 桥，收页面消息
/// 子 webview 在主 webview 之上、bounds 不重叠，只露出壳的标题栏区域。
/// resize 时同步 app webview 的 bounds。
#[cfg(windows)]
mod windows_impl {
    use super::*;
    use tauri::webview::{PageLoadEvent, WebviewBuilder};
    use tauri::window::WindowBuilder;
    use tauri::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Rect, WebviewUrl};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2WebMessageReceivedEventArgs;
    use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Shell::{
        DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowRect, HTCAPTION, HTCLIENT, HTBOTTOM, HTBOTTOMLEFT, HTBOTTOMRIGHT,
        HTLEFT, HTRIGHT, HTTOP, HTTOPLEFT, HTTOPRIGHT, WM_NCDESTROY, WM_NCHITTEST,
    };

    pub(super) fn open(app_handle: &AppHandle, entry: Arc<MiniAppEntry>) {
        let parsed = match entry.url.parse::<tauri::Url>() {
            Ok(u) => u,
            Err(_) => {
                fail(app_handle, &entry, "Mini App URL 无效");
                return;
            }
        };

        let label = entry.label.clone();
        let app_label = format!("{label}-app");
        let shell_label = format!("{label}-shell");
        let script = format!("{BRIDGE_SCRIPT}\n{SCROLLBAR_SCRIPT}");

        let window = match WindowBuilder::new(app_handle, &label)
            .title(&entry.title)
            // 无系统标题栏：顶部由壳 HTML 自绘
            .decorations(false)
            .inner_size(460.0, 720.0)
            .min_inner_size(360.0, 480.0)
            .resizable(true)
            .build()
        {
            Ok(w) => w,
            Err(e) => {
                fail(app_handle, &entry, &format!("创建 Mini App 窗口失败: {e}"));
                return;
            }
        };

        // 壳 webview：本地 HTML 标题栏（全窗口；app 层盖住标题栏以下）
        let app_for_shell = app_handle.clone();
        let entry_for_shell = entry.clone();
        if let Err(e) = window.add_child(
            WebviewBuilder::new(&shell_label, WebviewUrl::App("miniapp-host.html".into()))
                .on_page_load(move |_webview, payload| {
                    // 壳加载完成后再推全量状态（早期 eval 会落在页面脚本之前）
                    if payload.event() == PageLoadEvent::Finished {
                        push_chrome(&app_for_shell, &entry_for_shell);
                    }
                }),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(460.0, 720.0),
        ) {
            fail(app_handle, &entry, &format!("创建壳 webview 失败: {e}"));
            return;
        }

        // app webview：只装 Mini App 页面 + SDK 桥，标题栏下方开始
        let app_for_load = app_handle.clone();
        let entry_for_load = entry.clone();
        let app_webview = match window.add_child(
            WebviewBuilder::new(&app_label, WebviewUrl::External(parsed))
                .initialization_script(&script)
                // 只允许 http(s) 导航；t.me 链接交给应用内解析（防 app 借 webview 逃逸）
                .on_navigation(move |u| {
                    let scheme_ok = matches!(u.scheme(), "http" | "https");
                    let host_ok = u
                        .host_str()
                        .map(|h| h != "t.me" && !h.ends_with(".t.me"))
                        .unwrap_or(false);
                    scheme_ok && host_ok
                })
                .on_page_load(move |_webview, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        // 加载完成后补发主题/视口，页面 SDK 初始化会向宿主请求
                        post_viewport(&app_for_load, &entry_for_load);
                        post_theme(&app_for_load, &entry_for_load);
                    }
                }),
            LogicalPosition::new(0.0, TITLEBAR_HEIGHT_LOGICAL),
            LogicalSize::new(460.0, 720.0 - TITLEBAR_HEIGHT_LOGICAL),
        ) {
            Ok(w) => w,
            Err(e) => {
                fail(app_handle, &entry, &format!("创建 Mini App webview 失败: {e}"));
                return;
            }
        };

        // 建窗期间可能已被关闭（数据已发送 / 用户抢先关掉）：不留这个窗口
        if entry.closed.load(Ordering::SeqCst) {
            let _ = window.close();
            return;
        }

        // 原生拖拽：标题栏区域 HTCAPTION（不依赖 data-tauri-drag-region 注入）
        install_drag(app_handle, &entry);

        // 页面 → 宿主：WebView2 原生 web message（chrome.webview.postMessage），
        // 不经过 Tauri IPC/ACL。闭包直接持有 entry，避免按 launch_id 回查时
        // 被「同 launch 重新打开」的新 entry 顶替。
        let app_for_messages = app_handle.clone();
        let entry_for_messages = entry.clone();
        let _ = app_webview.with_webview(move |platform| {
            let controller = platform.controller();
            let Ok(core) = (|| unsafe { controller.CoreWebView2() })() else {
                return;
            };
            let handler = WebMessageReceivedEventHandler::create(Box::new(move |_sender, args| {
                if let Some(args) = args.as_ref() {
                    if let Some(text) = read_message(args) {
                        on_page_message(&app_for_messages, &entry_for_messages, &text);
                    }
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = unsafe { core.add_WebMessageReceived(&handler, &mut token) };
        });

        // 窗口 resize：同步 app webview 的 bounds（壳保持全窗口）
        let app_for_resize = app_handle.clone();
        let label_for_resize = label.clone();
        let app_label_for_resize = app_label.clone();
        let shell_label_for_resize = shell_label.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Resized(_) = event {
                if let Some(w) = app_for_resize.get_window(&label_for_resize) {
                    if let (Ok(size), Ok(scale)) = (w.inner_size(), w.scale_factor()) {
                        let tb = (TITLEBAR_HEIGHT_LOGICAL * scale).round() as i32;
                        let h = size.height.saturating_sub(tb as u32);
                        // 壳保持全窗口：标题栏任意宽度都由壳接收点击（拖动/按钮）
                        if let Some(shell) = app_for_resize.get_webview(&shell_label_for_resize) {
                            let _ = shell.set_bounds(Rect {
                                position: PhysicalPosition::new(0, 0).into(),
                                size: PhysicalSize::new(size.width, size.height).into(),
                            });
                        }
                        if let Some(wv) = app_for_resize.get_webview(&app_label_for_resize) {
                            let _ = wv.set_bounds(Rect {
                                position: PhysicalPosition::new(0, tb).into(),
                                size: PhysicalSize::new(size.width, h).into(),
                            });
                        }
                    }
                }
            }
        });

        // 用户关闭（Alt+F4 / 任务栏 / 壳关闭按钮走 miniapp_close）：完整收尾
        let app_for_close = app_handle.clone();
        let label_for_close = entry.label.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let launch_id = LABEL_TO_LAUNCH
                    .lock()
                    .ok()
                    .and_then(|map| map.get(&label_for_close).copied())
                    .unwrap_or(0);
                if launch_id > 0 {
                    if let Some(entry) = APPS
                        .lock()
                        .ok()
                        .and_then(|map| map.get(&launch_id).cloned())
                    {
                        if !entry.closed.load(Ordering::SeqCst) {
                            close_entry(&app_for_close, &entry);
                        }
                    }
                }
            }
        });
    }

    /// 建窗失败统一收尾：发 failed 事件 + 摘记账。
    fn fail(app_handle: &AppHandle, entry: &Arc<MiniAppEntry>, message: &str) {
        let _ = app_handle.emit(
            "miniapp-event",
            json!({
                "launch_id": entry.launch_id,
                "event": "failed",
                "data": { "message": message },
            }),
        );
        if let Ok(mut map) = APPS.lock() {
            map.remove(&entry.launch_id);
        }
        if let Ok(mut map) = LABEL_TO_LAUNCH.lock() {
            map.remove(&entry.label);
        }
    }

    // ───────────── 原生拖拽（无边框窗口标题栏 HTCAPTION） ─────────────
    //
    // 不用 data-tauri-drag-region：child webview（壳）不保证被注入拖拽脚本。
    // subclass 窗口过程里，标题栏区域（按钮区除外）返回 HTCAPTION 交给系统拖拽，
    // 按钮区返回 HTCLIENT 保住点击；边缘返回 HT* 支持 resize。

    const SUBCLASS_ID: usize = 0x4D49_4E49;

    struct DragState {
        entry: Arc<MiniAppEntry>,
    }

    /// label → 拖拽状态（subclass 数据里存 `Arc::as_ptr`，NCDESTROY 时摘除）。
    static DRAG_STATES: Mutex<BTreeMap<String, Arc<DragState>>> = Mutex::new(BTreeMap::new());

    // hwnd 是 UI 线程专属裸指针；subclass 只在窗口拥有线程跑，跨线程只克隆 Arc。
    unsafe impl Send for DragState {}
    unsafe impl Sync for DragState {}

    /// 安装拖拽 subclass（必须在窗口拥有线程注册）。
    fn install_drag(app_handle: &AppHandle, entry: &Arc<MiniAppEntry>) -> Option<HWND> {
        let window = app_handle.get_window(&entry.label)?;
        let hwnd = window.hwnd().ok()?;
        let hwnd = HWND((hwnd.0 as isize) as *mut std::ffi::c_void);
        let state = Arc::new(DragState {
            entry: entry.clone(),
        });
        if let Ok(mut map) = DRAG_STATES.lock() {
            map.insert(entry.label.clone(), state.clone());
        }
        let app_for_subclass = app_handle.clone();
        let hwnd_raw = hwnd.0 as isize;
        let _ = app_for_subclass.run_on_main_thread(move || {
            let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
            unsafe {
                let _ = SetWindowSubclass(
                    hwnd,
                    Some(drag_subclass_proc),
                    SUBCLASS_ID,
                    Arc::as_ptr(&state) as usize,
                );
            }
        });
        Some(hwnd)
    }

    unsafe extern "system" fn drag_subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _uid: usize,
        refdata: usize,
    ) -> LRESULT {
        if refdata == 0 {
            return DefSubclassProc(hwnd, msg, wparam, lparam);
        }
        let state = &*(refdata as *const DragState);
        match msg {
            WM_NCDESTROY => {
                let label = state.entry.label.clone();
                let _ = DRAG_STATES.lock().map(|mut m| m.remove(&label));
                let _ = RemoveWindowSubclass(hwnd, Some(drag_subclass_proc), SUBCLASS_ID);
                DefSubclassProc(hwnd, msg, wparam, lparam)
            }
            WM_NCHITTEST => {
                let lp = lparam.0;
                let sx = ((lp & 0xFFFF) as u16) as i16 as i32;
                let sy = (((lp >> 16) & 0xFFFF) as u16) as i16 as i32;
                // 无边框窗口客户区原点 == 窗口原点，屏幕坐标减窗口左上即客户区坐标
                let mut wr: RECT = std::mem::zeroed();
                let mut cr: RECT = std::mem::zeroed();
                let _ = GetWindowRect(hwnd, &mut wr);
                let _ = GetClientRect(hwnd, &mut cr);
                let x = sx - wr.left - cr.left;
                let y = sy - wr.top - cr.top;
                let (w, h) = (cr.right - cr.left, cr.bottom - cr.top);
                let scale = GetDpiForWindow(hwnd) as f64 / 96.0;
                let tb = (TITLEBAR_HEIGHT_LOGICAL * scale).round() as i32;
                let edge = (8.0 * scale).round() as i32;
                let code = if x <= edge && y <= edge {
                    HTTOPLEFT
                } else if x >= w - edge && y <= edge {
                    HTTOPRIGHT
                } else if x <= edge && y >= h - edge {
                    HTBOTTOMLEFT
                } else if x >= w - edge && y >= h - edge {
                    HTBOTTOMRIGHT
                } else if y <= edge {
                    HTTOP
                } else if y >= h - edge {
                    HTBOTTOM
                } else if x <= edge {
                    HTLEFT
                } else if x >= w - edge {
                    HTRIGHT
                } else if y < tb {
                    // 标题栏：按钮区（返回/关闭）进客户区收点击，其余交给系统拖拽
                    let btn = (32.0 * scale).round() as i32;
                    let pad = (6.0 * scale).round() as i32;
                    let top = (tb - btn) / 2;
                    let bottom = (tb + btn) / 2;
                    let in_v = y >= top && y <= bottom;
                    let back_hit = state.entry.back_visible.load(Ordering::SeqCst)
                        && in_v
                        && x >= pad
                        && x <= pad + btn;
                    let close_hit = in_v && x >= w - pad - btn && x <= w - pad;
                    if back_hit || close_hit {
                        HTCLIENT
                    } else {
                        HTCAPTION
                    }
                } else {
                    HTCLIENT
                };
                LRESULT(code as isize)
            }
            _ => DefSubclassProc(hwnd, msg, wparam, lparam),
        }
    }

    /// WebView2 的 web message 统一按 JSON 取，字符串消息也能拿到原文。
    fn read_message(args: &ICoreWebView2WebMessageReceivedEventArgs) -> Option<String> {
        let mut raw = PWSTR::null();
        unsafe { args.WebMessageAsJson(&mut raw).ok()? };
        let json = take_pwstr(raw);
        // bridge 发的是一条 JSON 字符串，WebMessageAsJson 返回的是带引号的字面量
        Some(serde_json::from_str::<String>(&json).unwrap_or(json))
    }

    /// 桥脚本：在文档创建时（页面自己的脚本之前）注入，只在顶层文档生效。
    /// 与 Unigram 的注入内容对齐（external.invoke 走 chrome.webview.postMessage）。
    const BRIDGE_SCRIPT: &str = r#"(function () {
  try {
    if (window.top !== window) return;
    // 阻断指针锁定等强权限 API（Mini App 权限由宿主控制）
    Element.prototype.requestPointerLock = undefined;
    // WebView2 没有 external.notify：补一个走原生 web message 的通道
    window.external = {
      invoke: function (s) {
        var bridge = window.chrome && window.chrome.webview;
        if (bridge) {
          try { bridge.postMessage(s); } catch (e) {}
        }
      }
    };
    // SDK 首选 TelegramWebviewProxy；线格式与 Unigram 一致：["eventType","eventData"]
    window.TelegramWebviewProxy = {
      postEvent: function (eventType, eventData) {
        if (window.external && window.external.invoke) {
          window.external.invoke(JSON.stringify([eventType, eventData]));
        }
      }
    };
  } catch (e) {}
})();"#;

    /// 滚动条注入：与主应用 index.css 的全局滚动条一致（6px、透明轨道、胶囊拇指、
    /// 隐藏端点按钮）。只在页面自身没有滚动条相关样式时生效；页面一旦声明了
    /// scrollbar 相关 CSS（或 inline style），就撤掉注入样式，完全交给页面。
    /// 明暗配色跟随系统 prefers-color-scheme（与 index.css 的 light/dark 变量一致）。
    const SCROLLBAR_SCRIPT: &str = r#"(function () {
  try {
    if (window.top !== window) return;
    var STYLE_ID = '__dsh_miniapp_scrollbar';
    var CSS = '' +
      '*::-webkit-scrollbar{width:6px;height:6px;background:transparent}' +
      '*::-webkit-scrollbar-track{background:transparent}' +
      '*::-webkit-scrollbar-corner{display:none;background:transparent}' +
      '*::-webkit-scrollbar-button,' +
      '*::-webkit-scrollbar-button:single-button,' +
      '*::-webkit-scrollbar-button:vertical:decrement,' +
      '*::-webkit-scrollbar-button:vertical:increment,' +
      '*::-webkit-scrollbar-button:horizontal:decrement,' +
      '*::-webkit-scrollbar-button:horizontal:increment,' +
      '*::-webkit-scrollbar-button:vertical:start:decrement,' +
      '*::-webkit-scrollbar-button:vertical:end:increment,' +
      '*::-webkit-scrollbar-button:horizontal:start:decrement,' +
      '*::-webkit-scrollbar-button:horizontal:end:increment' +
      '{display:none;width:0;height:0;border:none;background:transparent;background-image:none;-webkit-appearance:none}' +
      '*::-webkit-scrollbar-thumb{background-color:rgba(100,116,139,0.38);border-radius:999px;border:1px solid transparent;background-clip:padding-box}' +
      '*::-webkit-scrollbar-thumb:hover{background-color:rgba(71,85,105,0.55)}' +
      '*::-webkit-scrollbar-thumb:active{background-color:rgba(51,65,85,0.72)}' +
      '@media (prefers-color-scheme: dark){' +
        '*::-webkit-scrollbar-thumb{background-color:rgba(255,255,255,0.2)}' +
        '*::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,0.36)}' +
        '*::-webkit-scrollbar-thumb:active{background-color:rgba(255,255,255,0.52)}' +
      '}';

    var styleEl = null;

    // 页面是否已有滚动条相关样式：样式表规则 / inline style 中出现 scrollbar 即视为自定义
    var pageHasScrollbarCss = function () {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        var sheet = sheets[i];
        if (sheet.ownerNode === styleEl) continue;
        var rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          if (/scrollbar/i.test(rules[j].cssText)) return true;
        }
      }
      return !!document.querySelector('[style*="scrollbar"]');
    };

    var sync = function () {
      var host = document.head;
      if (!host) return;
      if (pageHasScrollbarCss()) {
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        styleEl = null;
        return;
      }
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = CSS;
        host.appendChild(styleEl);
      } else if (!styleEl.parentNode) {
        host.appendChild(styleEl);
      }
    };

    var timer = 0;
    var schedule = function () {
      if (timer) return;
      timer = setTimeout(function () { timer = 0; sync(); }, 50);
    };

    // 页面动态插入样式（框架运行时、CSS-in-JS）时重新判定
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'STYLE' || n.tagName === 'LINK' || n.querySelector('style,link')) {
            schedule();
            return;
          }
        }
      }
    });

    var boot = function () {
      mo.observe(document.documentElement, { childList: true, subtree: true });
      sync();
    };
    if (document.documentElement) boot();
    else document.addEventListener('readystatechange', boot, { once: true });
    document.addEventListener('DOMContentLoaded', sync);
    window.addEventListener('load', sync);
  } catch (e) {}
})();"#;
}
