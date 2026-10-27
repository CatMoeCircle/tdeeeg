//! Web 代理载体（TDLib 1.8.69 的 `proxyTypeWeb`）。
//!
//! TDLib 不自己跑 Web 代理的传输：它把 MTProto 流量交给应用里的「carrier」——
//! 一个 HTTPS relay 页面，必须作为**隐藏 webview 的顶层文档**加载，应用再在页面里
//! 准备一个只读桥对象（`carrier.bridge_object_name`，当前恒为 `TelegramWebProxy`）。
//! 三个新 update 就是完整协议：
//!
//! - `updateWebProxyCarrierOpened`：建隐藏 webview，注入桥对象，并限制它只在
//!   `carrier.origin` + `carrier.path_prefix` 里活动
//! - `updateWebProxyCarrierData`：把 base64 数据按顺序投递到页面的 `onmessage`
//! - `updateWebProxyCarrierClosed`：页面发过消息就先投递 `{"t":"close"}` 让它收尾，
//!   ~200ms 后销毁 webview；没发过就立即销毁
//!
//! 页面 → TDLib 走 **WebView2 原生 web message**（`chrome.webview.postMessage`），
//! 不走 Tauri IPC：远程 origin 的 IPC 要求 app ACL manifest，一旦引入，
//! 主窗口现有的全部自定义命令都得逐个登记进 capabilities，否则前端整体失效。
//!
//! 只有 Windows（WebView2）能注入桥对象并回传 web message；其它平台在 Opened 时
//! 回报 `webProxyCarrierErrorUnsupported`，TDLib 在代理被重新启用前不再请求载体。
//!
//! 载体按 `(session_id, carrier_id)` 记账：多个账户可能同时用同一个 Web 代理，
//! carrier_id 由各客户端自行分配，单键会让两个账户互相顶掉窗口。

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

use super::AppState;

/// 页面加载超时：过了还没 load 完就回报 LoadFailed，让 TDLib 稍后重新请求载体。
/// 没有可靠的「加载失败」回调（被 on_navigation 拦下的跳转也会算失败），
/// 所以用超时兜底而不是监听 NavigationCompleted。
const LOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// 一个载体的运行时状态。
struct Carrier {
    /// 承载它的隐藏窗口 label（全局唯一，不复用 carrier_id）
    label: String,
    /// 页面是否已经通过桥对象 postMessage 过（决定 Closed 时要不要先投递 close）
    spoke: AtomicBool,
    /// 页面是否已 load 完成
    loaded: AtomicBool,
    /// 已收到 Closed：之后页面再发消息一律丢弃
    closed: AtomicBool,
}

/// 隐藏载体窗口的 label 前缀（窗口状态插件按它排除这些临时窗口）。
pub(crate) const WINDOW_LABEL_PREFIX: &str = "webproxy-carrier-";

/// 窗口 label 序号：TDLib 可以在旧载体的窗口还没销毁时重开同一个 carrier_id，
/// 用自增序号保证 label 永不冲突。
static NEXT_LABEL: AtomicI64 = AtomicI64::new(1);

/// `(session_id, carrier_id)` → 载体状态。
static CARRIERS: Mutex<BTreeMap<(i64, i64), Arc<Carrier>>> = Mutex::new(BTreeMap::new());

/// 处理一条载体相关 update。返回 true 表示已消费（调用方不要再下发给前端）。
pub(super) fn handle_update(app_handle: &AppHandle, session_id: i64, event: &Value) -> bool {
    let Some(kind) = event.get("_").and_then(|v| v.as_str()) else {
        return false;
    };
    match kind {
        "updateWebProxyCarrierOpened" => {
            let Some(carrier) = event.get("carrier") else {
                return true;
            };
            let id = carrier.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            if id > 0 {
                open_carrier(app_handle, session_id, id, carrier);
            }
            true
        }
        "updateWebProxyCarrierData" => {
            let id = event.get("carrier_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let data = event.get("data").and_then(|v| v.as_str()).unwrap_or("");
            if id > 0 && !data.is_empty() {
                deliver_data(app_handle, session_id, id, data);
            }
            true
        }
        "updateWebProxyCarrierClosed" => {
            let id = event.get("carrier_id").and_then(|v| v.as_i64()).unwrap_or(0);
            if id > 0 {
                close_carrier(app_handle, session_id, id);
            }
            true
        }
        _ => false,
    }
}

/// 账户关闭时清掉它名下所有载体（客户端已销毁，页面留着只会空转）。
pub(super) fn close_session(app_handle: &AppHandle, session_id: i64) {
    let keys: Vec<(i64, i64)> = CARRIERS
        .lock()
        .map(|map| {
            map.keys()
                .filter(|(session, _)| *session == session_id)
                .copied()
                .collect()
        })
        .unwrap_or_default();
    for (_, carrier_id) in keys {
        close_carrier(app_handle, session_id, carrier_id);
    }
}

fn open_carrier(app_handle: &AppHandle, session_id: i64, carrier_id: i64, carrier: &Value) {
    #[cfg(windows)]
    {
        // 同一 (session, carrier) 重复 Opened：按正常关闭流程收掉旧的
        close_carrier(app_handle, session_id, carrier_id);

        let entry = Arc::new(Carrier {
            label: format!(
                "{WINDOW_LABEL_PREFIX}{}",
                NEXT_LABEL.fetch_add(1, Ordering::SeqCst)
            ),
            spoke: AtomicBool::new(false),
            loaded: AtomicBool::new(false),
            closed: AtomicBool::new(false),
        });
        // 先把账记上：Data/Closed 都是随后才可能到的，记账在窗口建好之前就生效
        if let Ok(mut map) = CARRIERS.lock() {
            map.insert((session_id, carrier_id), entry.clone());
        }

        // 建窗口要跟主线程来回一次。放到独立线程里做，避免把 TDLib 接收循环卡在
        // 窗口创建上 —— 主线程若正好在等一条 TDLib 响应，双方就会互相等死。
        let app = app_handle.clone();
        let carrier = carrier.clone();
        std::thread::spawn(move || {
            windows_impl::open(&app, session_id, carrier_id, &carrier, entry)
        });
    }

    #[cfg(not(windows))]
    {
        let _ = carrier;
        report_error(
            app_handle,
            session_id,
            carrier_id,
            json!({ "@type": "webProxyCarrierErrorUnsupported" }),
        );
    }
}

/// 把 TDLib 给的一帧数据按顺序投递给载体页面（ArrayBuffer）。
fn deliver_data(app_handle: &AppHandle, session_id: i64, carrier_id: i64, data: &str) {
    let Some(entry) = carrier_entry(session_id, carrier_id) else {
        return;
    };
    if entry.closed.load(Ordering::SeqCst) {
        return;
    }
    let Some(window) = app_handle.get_webview_window(&entry.label) else {
        return;
    };
    // base64 只含 [A-Za-z0-9+/=]，直接内联进 JS 字面量是安全的
    let _ = window.eval(&format!(
        "window.__tdwebproxyDeliver&&window.__tdwebproxyDeliver((function(){{var s=atob(\"{data}\");\
         var u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer;}})())"
    ));
}

/// TDLib 要求销毁载体：页面发过消息就先送 `{"t":"close"}` 收尾再延迟销毁。
fn close_carrier(app_handle: &AppHandle, session_id: i64, carrier_id: i64) {
    let Some(entry) = take_carrier(session_id, carrier_id) else {
        return;
    };
    entry.closed.store(true, Ordering::SeqCst);

    let Some(window) = app_handle.get_webview_window(&entry.label) else {
        return;
    };
    if entry.spoke.load(Ordering::SeqCst) {
        let close_message =
            serde_json::to_string("{\"t\":\"close\"}").unwrap_or_else(|_| "\"\"".into());
        let _ = window.eval(&format!(
            "window.__tdwebproxyDeliver&&window.__tdwebproxyDeliver({close_message})"
        ));
        // 给页面的 relay 会话留出收尾时间，再销毁（TDLib 建议 ~200ms）
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let _ = window.close();
        });
    } else {
        let _ = window.close();
    }
}

/// 页面通过桥对象 postMessage 过来的消息 → `processWebProxyCarrierMessage`。
fn on_page_message(app: &AppHandle, session_id: i64, carrier_id: i64, payload: &str) {
    // 先确认载体仍然有效，并记下「页面发过消息」
    match carrier_entry(session_id, carrier_id) {
        Some(entry) if !entry.closed.load(Ordering::SeqCst) => {
            entry.spoke.store(true, Ordering::SeqCst);
        }
        _ => return,
    }

    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return;
    };
    if value.get("c").and_then(|v| v.as_i64()) != Some(carrier_id) {
        return;
    }
    let data = value.get("d").and_then(|v| v.as_str()).unwrap_or("");
    let message = match value.get("k").and_then(|v| v.as_str()) {
        Some("text") => json!({ "@type": "webProxyCarrierMessageText", "text": data }),
        Some("binary") => json!({ "@type": "webProxyCarrierMessageBinary", "data": data }),
        _ => return,
    };
    send_to_client(
        app,
        session_id,
        json!({
            "@type": "processWebProxyCarrierMessage",
            "carrier_id": carrier_id,
            "message": message,
        }),
    );
}

/// 回报载体失败。`error` 是 TDLib 的 WebProxyCarrierError 对象。
fn report_error(app: &AppHandle, session_id: i64, carrier_id: i64, error: Value) {
    send_to_client(
        app,
        session_id,
        json!({
            "@type": "reportWebProxyCarrierError",
            "carrier_id": carrier_id,
            "error": error,
        }),
    );
}

/// 按 session 取客户端发一条请求。
///
/// 全程持有 `clients` 锁与 `Arc<TdLibClient>`：客户端只能从 map 里移除后才会
/// destroy，所以这里发送时指针一定有效（不在闭包里保存裸指针）。
fn send_to_client(app: &AppHandle, session_id: i64, req: Value) {
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

fn carrier_entry(session_id: i64, carrier_id: i64) -> Option<Arc<Carrier>> {
    CARRIERS
        .lock()
        .ok()
        .and_then(|map| map.get(&(session_id, carrier_id)).cloned())
}

/// 摘掉并返回载体状态（摘掉之后页面再发来的消息会被忽略）。
fn take_carrier(session_id: i64, carrier_id: i64) -> Option<Arc<Carrier>> {
    CARRIERS
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&(session_id, carrier_id)))
}

/// 只在记账仍是 `entry` 本人时摘除：旧的载体建窗线程出错时不能把同 id 的
/// 新载体一起清掉。
fn unregister_carrier_if(session_id: i64, carrier_id: i64, entry: &Arc<Carrier>) {
    if let Ok(mut map) = CARRIERS.lock() {
        let same = map
            .get(&(session_id, carrier_id))
            .is_some_and(|current| Arc::ptr_eq(current, entry));
        if same {
            map.remove(&(session_id, carrier_id));
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2WebMessageReceivedEventArgs;
    use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
    use windows::core::PWSTR;

    pub(super) fn open(
        app_handle: &AppHandle,
        session_id: i64,
        carrier_id: i64,
        carrier: &Value,
        entry: Arc<Carrier>,
    ) {
        let text = |key: &str| -> String {
            carrier
                .get(key)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string()
        };
        let url = text("url");
        let origin = text("origin");
        let path_prefix = text("path_prefix");
        let bridge_object_name = text("bridge_object_name");

        if url.is_empty() || origin.is_empty() || bridge_object_name.is_empty() {
            unregister_carrier_if(session_id, carrier_id, &entry);
            report_error(
                app_handle,
                session_id,
                carrier_id,
                json!({
                    "@type": "webProxyCarrierErrorLoadFailed",
                    "message": "carrier is missing url, origin or bridge_object_name",
                }),
            );
            return;
        }

        let parsed = match url.parse::<tauri::Url>() {
            Ok(u) => u,
            Err(_) => {
                unregister_carrier_if(session_id, carrier_id, &entry);
                // 按 TDLib 要求：错误信息里不能出现 url 本身
                report_error(
                    app_handle,
                    session_id,
                    carrier_id,
                    json!({
                        "@type": "webProxyCarrierErrorLoadFailed",
                        "message": "carrier url is not a valid URL",
                    }),
                );
                return;
            }
        };

        let label = entry.label.clone();
        let script = bridge_script(&origin, &bridge_object_name, carrier_id);
        let origin_for_nav = origin.clone();
        let prefix_for_nav = if path_prefix.is_empty() {
            "/".to_string()
        } else {
            path_prefix
        };
        let entry_for_load = entry.clone();

        let builder = WebviewWindowBuilder::new(app_handle, &label, WebviewUrl::External(parsed))
            .title("tdeeeg web proxy")
            .visible(false)
            .skip_taskbar(true)
            .decorations(false)
            .focused(false)
            .inner_size(1.0, 1.0)
            .initialization_script(&script)
            // TDLib 要求载体不得导航到别的 origin；顺带限制在 relay 的 path 前缀内
            .on_navigation(move |u| {
                u.origin().ascii_serialization() == origin_for_nav
                    && u.path().starts_with(&prefix_for_nav)
            })
            .on_page_load(move |_webview, payload| {
                if payload.event() == PageLoadEvent::Finished {
                    entry_for_load.loaded.store(true, Ordering::SeqCst);
                }
            });

        let window = match builder.build() {
            Ok(w) => w,
            Err(e) => {
                unregister_carrier_if(session_id, carrier_id, &entry);
                report_error(
                    app_handle,
                    session_id,
                    carrier_id,
                    json!({
                        "@type": "webProxyCarrierErrorLoadFailed",
                        "message": format!("failed to create carrier webview: {e}"),
                    }),
                );
                return;
            }
        };

        // 建窗期间 TDLib 可能已经把这个载体关了（Closed / 被同 id 的新载体顶掉）：
        // 那就不要再留着这个窗口。
        if entry.closed.load(Ordering::SeqCst) {
            let _ = window.close();
            return;
        }

        // 页面 → TDLib：WebView2 原生 web message（bridge 脚本里调用
        // chrome.webview.postMessage），不经过 Tauri IPC/ACL。
        let app_for_messages = app_handle.clone();
        let _ = window.with_webview(move |platform| {
            let controller = platform.controller();
            let core = match unsafe { controller.CoreWebView2() } {
                Ok(core) => core,
                Err(_) => {
                    report_error(
                        &app_for_messages,
                        session_id,
                        carrier_id,
                        json!({ "@type": "webProxyCarrierErrorTerminated" }),
                    );
                    return;
                }
            };
            let app = app_for_messages.clone();
            let handler = WebMessageReceivedEventHandler::create(Box::new(move |_sender, args| {
                if let Some(args) = args.as_ref() {
                    if let Some(text) = read_message(args) {
                        on_page_message(&app, session_id, carrier_id, &text);
                    }
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = unsafe { core.add_WebMessageReceived(&handler, &mut token) };
        });

        spawn_load_timeout(app_handle, session_id, carrier_id, entry);
    }

    /// WebView2 的 web message 统一按 JSON 取，字符串消息也能拿到原文。
    fn read_message(args: &ICoreWebView2WebMessageReceivedEventArgs) -> Option<String> {
        let mut raw = PWSTR::null();
        unsafe { args.WebMessageAsJson(&mut raw).ok()? };
        let json = take_pwstr(raw);
        // bridge 发的是一条 JSON 字符串，WebMessageAsJson 返回的是带引号的字面量
        Some(serde_json::from_str::<String>(&json).unwrap_or(json))
    }

    /// 超时兜底：页面迟迟没 load 完就回报 LoadFailed，再按关闭流程拆掉载体。
    fn spawn_load_timeout(
        app_handle: &AppHandle,
        session_id: i64,
        carrier_id: i64,
        entry: Arc<Carrier>,
    ) {
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(LOAD_TIMEOUT);
            if entry.loaded.load(Ordering::SeqCst) || entry.closed.load(Ordering::SeqCst) {
                return;
            }
            report_error(
                &app_handle,
                session_id,
                carrier_id,
                json!({
                    "@type": "webProxyCarrierErrorLoadFailed",
                    "message": "carrier page did not finish loading in time",
                }),
            );
            close_carrier(&app_handle, session_id, carrier_id);
        });
    }

    /// 桥对象脚本：在文档创建时（页面自己的脚本之前）注入，只在顶层文档且
    /// origin 精确匹配时生效，对象本身只读，只暴露 postMessage / onmessage。
    fn bridge_script(origin: &str, bridge_object_name: &str, carrier_id: i64) -> String {
        let json_string = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into());
        BRIDGE_SCRIPT
            .replace("__ORIGIN__", &json_string(origin))
            .replace("__NAME__", &json_string(bridge_object_name))
            .replace("__CARRIER__", &carrier_id.to_string())
    }

    /// 占位符用 replace 注入，避免 format! 把脚本里所有花括号都转义一遍。
    const BRIDGE_SCRIPT: &str = r#"(function () {
  try {
    if (window.top !== window) return;
    if (window.location.origin !== __ORIGIN__) return;
    var NAME = __NAME__;
    var CARRIER = __CARRIER__;
    function toBase64(buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = "";
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }
    var handler = null;
    var api = {};
    Object.defineProperty(api, "onmessage", {
      enumerable: true,
      configurable: false,
      get: function () { return handler; },
      set: function (fn) { handler = fn; }
    });
    Object.defineProperty(api, "postMessage", {
      enumerable: true,
      configurable: false,
      value: function (value) {
        var kind, data;
        if (typeof value === "string") {
          kind = "text";
          data = value;
        } else if (value instanceof ArrayBuffer) {
          kind = "binary";
          data = toBase64(value);
        } else if (ArrayBuffer.isView(value)) {
          kind = "binary";
          data = toBase64(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        } else {
          return;
        }
        var bridge = window.chrome && window.chrome.webview;
        if (!bridge) return;
        try {
          bridge.postMessage(JSON.stringify({ c: CARRIER, k: kind, d: data }));
        } catch (e) {}
      }
    });
    Object.freeze(api);
    Object.defineProperty(window, NAME, {
      value: api,
      writable: false,
      configurable: false,
      enumerable: false
    });
    Object.defineProperty(window, "__tdwebproxyDeliver", {
      value: function (data) {
        if (typeof handler !== "function") return;
        try { handler({ data: data }); } catch (e) {}
      },
      writable: false,
      configurable: false,
      enumerable: false
    });
  } catch (e) {}
})();"#;
}
