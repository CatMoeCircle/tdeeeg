//! HTML Widget 消息承载（`messageWidget`）。
//!
//! 机器人下发的小部件是一段 HTML，官方客户端把它交给隔离的 WebView 渲染（脚本可执行、
//! 但拿不到宿主页面）。这里用同样的思路：把 HTML 通过独立协议回给 `<iframe sandbox>`。
//!
//! 为什么不用 `srcdoc` / `blob:` / `data:`：
//! 这些文档会**继承主文档 CSP**（`tauri.conf.json` 的 `script-src 'self'`），小部件脚本一律
//! 被拦，`postMessage` 自动高度也无从谈起。自定义协议是独立 origin（Windows:
//! `http://widget.localhost`，其它平台 `widget://localhost`），响应头自带 CSP，
//! 脚本可以跑；iframe 仍是 opaque origin（不带 `allow-same-origin`），
//! 因此读不到主文档 DOM。
//!
//! IPC 为什么打不通（两层，均已实测）：
//! 1. Tauri 的 IPC 走 `fetch('http://ipc.localhost/…')`，本模块的 `connect-src 'none'`
//!    会把它拦下来；同时 sandbox iframe 的 opaque origin 会让请求头 `Origin: null`，
//!    Tauri 侧解析 Origin 也会直接拒绝；
//! 2. Tauri 的初始化脚本确实注入到所有框架（iframe 里能拿到 `__TAURI_INTERNALS__`），
//!    所以前端外壳文档额外把 `chrome.webview.postMessage` 换成空函数，
//!    把 `window.ipc` 这条回退通道也堵死 —— 见 MessageWidgetContent 的 IPC_GUARD_SCRIPT。

use std::sync::Mutex;

use tauri::http::{
    header::{CACHE_CONTROL, CONTENT_TYPE},
    Request, Response, StatusCode,
};

/// 自定义协议名（`widget://` / `http://widget.localhost`）
pub const SCHEME: &str = "widget";
/// 单份文档上限：TDLib 规定 HTML 1-32768 字节，留出外壳脚本的余量
const MAX_DOC_BYTES: usize = 128 * 1024;
/// 同时缓存的小部件文档数（先进先出淘汰）
const MAX_DOCS: usize = 128;

/// 小部件文档 CSP。
///
/// 设计目标：**小部件完全没有外网访问权限**，只用本地资源自己画。
///
/// - `default-src 'none'`：默认全禁，只放行下面列出的项；
/// - 脚本 / 样式：只允许内联（`<script>` / `<style>` / `style="…"`），不给外部文件；
/// - 图片 / 媒体：只允许 `data:`（含 `data:image/svg+xml`），
///   内联 `<svg>` 本身不受 CSP 限制；`http:` / `https:` 一律不放；
/// - 字体：只允许本协议（emoji 字体由宿主从内存同源回给 iframe），
///   不接受任何外部字体导入，也不放 `data:` 字体；
/// - `connect-src 'none'`：fetch / XHR / WebSocket / sendBeacon 全部断开；
/// - `frame-src 'none'`：禁止再嵌子框架（广告 / 追踪常见载体）；
/// - `base-uri` / `form-action` / `object-src` 关闭：不给改写基准地址、提交表单、挂插件的口子；
/// - `font-src` 必须写具体源：sandbox iframe 的 origin 是 opaque，CSP 里的 `'self'` 对它不生效。
const DOC_CSP: &str = "default-src 'none'; \
    script-src 'unsafe-inline' 'unsafe-eval'; \
    style-src 'unsafe-inline'; \
    img-src data:; \
    media-src data:; \
    font-src http://widget.localhost widget://localhost; \
    connect-src 'none'; \
    frame-src 'none'; \
    form-action 'none'; \
    base-uri 'none'; \
    object-src 'none'";

/// 文档缓存：`(id, html)`，按插入顺序淘汰。
static DOCS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

/// emoji 字体路由（文档里 `@font-face` 引用的同源地址）
const EMOJI_FONT_ROUTE: &str = "/__emoji-font";
/// emoji 字体在内存里的副本（前端启动后传一次，约 15 MB）
static EMOJI_FONT: Mutex<Option<Vec<u8>>> = Mutex::new(None);
/// 字体体积上限（Apple Color Emoji 约 15 MB，留余量）
const MAX_FONT_BYTES: usize = 32 * 1024 * 1024;

/// 接收 emoji 字体字节（前端 `fetch` 产物后按原始字节发过来）。
///
/// 为什么由前端传：字体在打包时被内嵌进前端资源（不在磁盘上），小部件又是独立 origin
/// 且被 sandbox 成 opaque origin，既读不到应用资源也过不了 CORS；放到内存里由
/// [`EMOJI_FONT_ROUTE`] 同源回给 iframe，是唯一同时适用于 dev / 打包版的方式。
#[tauri::command]
pub fn set_widget_emoji_font(request: tauri::ipc::Request<'_>) -> Result<usize, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw emoji font bytes".to_string());
    };
    if bytes.is_empty() {
        return Err("empty emoji font".to_string());
    }
    if bytes.len() > MAX_FONT_BYTES {
        return Err("emoji font is too large".to_string());
    }
    let len = bytes.len();
    *EMOJI_FONT.lock().map_err(|e| e.to_string())? = Some(bytes.clone());
    Ok(len)
}

/// 注册一份小部件文档，返回可供 iframe `src` 使用的地址。
///
/// 同一份 HTML 得到同一个 id，重复渲染不会换 URL（避免 iframe 重载、丢失小部件内部状态）。
#[tauri::command]
pub fn register_widget_html(html: String) -> Result<String, String> {
    if html.trim().is_empty() {
        return Err("widget html is empty".to_string());
    }
    if html.len() > MAX_DOC_BYTES {
        return Err("widget html is too large".to_string());
    }
    let id = doc_id(&html);
    store_doc(&id, &html);
    Ok(doc_url(&id))
}

/// 小部件页面地址。Tauri 在 Windows / Android 上把自定义协议映射为 `http://<scheme>.localhost`。
fn doc_url(id: &str) -> String {
    #[cfg(any(windows, target_os = "android"))]
    {
        format!("http://{SCHEME}.localhost/{id}")
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        format!("{SCHEME}://localhost/{id}")
    }
}

/// 协议处理：`/__emoji-font` 回 emoji 字体，其余按 id 取回文档。文档只存在内存里，不落盘。
pub fn respond(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.uri().path() == EMOJI_FONT_ROUTE {
        return emoji_font_response();
    }

    let id = request.uri().path().trim_start_matches('/').to_string();
    let html = DOCS
        .lock()
        .ok()
        .and_then(|docs| docs.iter().rev().find(|(k, _)| *k == id).map(|(_, v)| v.clone()));

    match html {
        Some(html) => Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, "text/html; charset=utf-8")
            .header("Content-Security-Policy", DOC_CSP)
            .header(CACHE_CONTROL, "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .body(html.into_bytes())
            .unwrap_or_else(|_| Response::new(Vec::new())),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(b"Widget not found".to_vec())
            .unwrap_or_else(|_| Response::new(Vec::new())),
    }
}

/// emoji 字体响应：内存里那份字体，强缓存（同一次运行内内容不变）。
fn emoji_font_response() -> Response<Vec<u8>> {
    let font = EMOJI_FONT.lock().ok().and_then(|f| f.clone());

    match font {
        Some(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, "font/ttf")
            // sandbox 文档是 opaque origin，同源请求也会走 CORS，必须显式放开
            .header("Access-Control-Allow-Origin", "*")
            .header("Cross-Origin-Resource-Policy", "cross-origin")
            .header(CACHE_CONTROL, "public, max-age=31536000, immutable")
            .header("X-Content-Type-Options", "nosniff")
            .body(bytes)
            .unwrap_or_else(|_| Response::new(Vec::new())),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(b"Emoji font not available".to_vec())
            .unwrap_or_else(|_| Response::new(Vec::new())),
    }
}

/// 文档 id：两路 FNV-1a 拼成 32 位十六进制，够短且几乎不会撞。
fn doc_id(html: &str) -> String {
    const OFFSET_A: u64 = 0xcbf2_9ce4_8422_2325;
    const OFFSET_B: u64 = 0x9e37_79b9_7f4a_7c15;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut a = OFFSET_A;
    let mut b = OFFSET_B;
    for byte in html.as_bytes() {
        a = (a ^ u64::from(*byte)).wrapping_mul(PRIME);
        b = (b ^ u64::from(*byte)).wrapping_mul(PRIME).rotate_left(7);
    }
    format!("{a:016x}{b:016x}")
}

fn store_doc(id: &str, html: &str) {
    let Ok(mut docs) = DOCS.lock() else {
        return;
    };
    docs.retain(|(k, _)| k != id);
    docs.push((id.to_string(), html.to_string()));
    while docs.len() > MAX_DOCS {
        docs.remove(0);
    }
}
