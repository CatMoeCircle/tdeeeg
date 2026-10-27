//! 代理配置：保存前端设置并应用到所有已运行的 TDLib 客户端。

use super::{shared, TdJsonClientSend};
use serde_json::json;
use std::ffi::CString;
use std::os::raw::c_void;
use tauri::State;

use super::AppState;

/// 前端保存的代理配置，供 TDLib 客户端创建后立即应用。
#[derive(Clone)]
pub struct ProxyConfig {
    /// disabled / auto / system / custom
    pub mode: String,
    /// custom 模式下要启用的代理 ID（来自 getProxies）
    pub proxy_id: Option<i64>,
    pub proxy_type: String,
    pub server: String,
    pub port: String,
    pub username: String,
    pub password: String,
    pub secret: String,
    /// proxyTypeWeb 的 relay 基础路径（不带首尾斜杠，可为空）
    pub path: String,
    pub comment: String,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            mode: "disabled".into(),
            proxy_id: None,
            proxy_type: "http".into(),
            server: String::new(),
            port: String::new(),
            username: String::new(),
            password: String::new(),
            secret: String::new(),
            path: String::new(),
            comment: String::new(),
        }
    }
}

fn read_windows_system_proxy() -> Option<(String, u16)> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let settings = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
            .ok()?;
        if settings.get_value::<u32, _>("ProxyEnable").unwrap_or(0) != 1 {
            return None;
        }
        let proxy_server: String = settings.get_value("ProxyServer").ok()?;
        if proxy_server.trim().is_empty() {
            return None;
        }

        // 按 scheme 列表取 http，其次 https（与 WinINET 的单代理串写法一致）
        let parts: Vec<&str> = proxy_server.split(';').map(str::trim).collect();
        let candidate = parts
            .iter()
            .find(|s| s.starts_with("http="))
            .or_else(|| parts.iter().find(|s| s.starts_with("https=")))
            .copied()
            .unwrap_or_else(|| proxy_server.trim());
        let host_port = candidate.split_once("://").map_or(candidate, |(_, rest)| rest);
        let (host, port) = host_port.rsplit_once(':')?;
        let port: u16 = port.trim().parse().ok()?;
        let host = host.trim().trim_matches('"');
        if host.is_empty() {
            return None;
        }
        Some((host.to_string(), port))
    }

    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// 构建 TDLib 的 addProxy 请求 JSON（根据代理类型）。
fn build_add_proxy_req(cfg: &ProxyConfig) -> serde_json::Value {
    let proxy_type = match cfg.proxy_type.as_str() {
        "socks5" => json!({
            "@type": "proxyTypeSocks5",
            "username": cfg.username,
            "password": cfg.password,
        }),
        "mtproto" => json!({
            "@type": "proxyTypeMtproto",
            "secret": cfg.secret,
        }),
        // TDLib 1.8.69：Web 代理（MTProto 走隐藏 webview 里的 HTTPS relay 页面）。
        // TDLib 要求 server 是域名、port 固定 443、secret 为 16 字节十六进制（可带 0xdd 前缀）。
        "web" => json!({
            "@type": "proxyTypeWeb",
            "path": cfg.path,
            "secret": cfg.secret,
        }),
        _ => json!({
            "@type": "proxyTypeHttp",
            "username": cfg.username,
            "password": cfg.password,
            "http_only": false,
        }),
    };
    json!({
        "@type": "addProxy",
        "proxy": {
            "@type": "proxy",
            "server": cfg.server.trim(),
            "port": cfg.port.trim().parse::<u16>().unwrap_or(0),
            "type": proxy_type,
        },
        "enable": true,
        "comment": cfg.comment,
    })
}

/// 当前配置对应的请求序列（system/auto 且读不到系统代理时退回 disableProxy）。
fn proxy_requests(cfg: &ProxyConfig) -> Vec<serde_json::Value> {
    let network_other =
        || json!({ "@type": "setNetworkType", "type": { "@type": "networkTypeOther" } });
    let disable = || json!({ "@type": "disableProxy" });

    match cfg.mode.as_str() {
        "custom" => match cfg.proxy_id {
            Some(id) => vec![json!({ "@type": "enableProxy", "proxy_id": id }), network_other()],
            None => vec![disable()],
        },
        "system" | "auto" => match read_windows_system_proxy() {
            Some((server, port)) => {
                let cfg = ProxyConfig {
                    proxy_type: "http".into(),
                    server,
                    port: port.to_string(),
                    ..cfg.clone()
                };
                vec![build_add_proxy_req(&cfg), network_other()]
            }
            None => vec![disable()],
        },
        "disabled" => vec![disable()],
        _ => vec![build_add_proxy_req(cfg), network_other()],
    }
}

/// 将当前代理配置应用到指定 TDLib 客户端。
pub(super) fn apply_proxy_to_client(
    send_fn: TdJsonClientSend,
    client: *mut c_void,
    cfg: &ProxyConfig,
) {
    for req in proxy_requests(cfg) {
        let Ok(c_str) = CString::new(req.to_string()) else {
            continue;
        };
        unsafe { send_fn(client, c_str.as_ptr()) };
    }
}

/// 保存代理配置并立即应用到所有已运行的 TDLib 客户端。
#[tauri::command]
pub fn set_proxy_config(
    state: State<AppState>,
    mode: String,
    proxy_id: Option<i64>,
    proxy_type: Option<String>,
    server: Option<String>,
    port: Option<String>,
    username: Option<String>,
    password: Option<String>,
    secret: Option<String>,
    path: Option<String>,
    comment: Option<String>,
) -> Result<(), String> {
    let cfg = {
        let mut guard = state
            .proxy_config
            .lock()
            .map_err(|e| format!("Failed to lock proxy config: {e}"))?;
        let cfg = &mut *guard;
        cfg.mode = mode;
        // 始终写入（含 None）：切换模式时清空旧 custom 代理 id，避免残留 id 被误启用
        cfg.proxy_id = proxy_id;
        if let Some(v) = proxy_type {
            cfg.proxy_type = v;
        }
        if let Some(v) = server {
            cfg.server = v;
        }
        if let Some(v) = port {
            cfg.port = v;
        }
        if let Some(v) = username {
            cfg.username = v;
        }
        if let Some(v) = password {
            cfg.password = v;
        }
        if let Some(v) = secret {
            cfg.secret = v;
        }
        if let Some(v) = path {
            cfg.path = v;
        }
        if let Some(v) = comment {
            cfg.comment = v;
        }
        cfg.clone()
    };

    // 动态库尚未加载（前端在 init_tdlib 之前同步配置）：暂无客户端可应用，
    // 配置已存入 state，创建客户端时自动生效，不算错误。
    let Ok(sh) = shared(state.inner()) else {
        return Ok(());
    };
    let clients = state.clients.lock().map_err(|e| e.to_string())?;
    for client in clients.values() {
        apply_proxy_to_client(sh.send_fn, client.client, &cfg);
    }
    Ok(())
}

#[tauri::command]
pub fn get_system_proxy() -> Result<Option<serde_json::Value>, String> {
    Ok(read_windows_system_proxy().map(|(server, port)| {
        json!({ "server": server, "port": port, "username": "", "password": "" })
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn types(cfg: &ProxyConfig) -> Vec<String> {
        proxy_requests(cfg)
            .iter()
            .filter_map(|r| r.get("@type").and_then(|v| v.as_str()).map(str::to_string))
            .collect()
    }

    #[test]
    fn modes_map_to_expected_requests() {
        let mut cfg = ProxyConfig::default();
        assert_eq!(types(&cfg), vec!["disableProxy"]);

        // custom 但没选代理：不能残留 enableProxy
        cfg.mode = "custom".into();
        assert_eq!(types(&cfg), vec!["disableProxy"]);
        cfg.proxy_id = Some(7);
        assert_eq!(types(&cfg), vec!["enableProxy", "setNetworkType"]);

        // 其它模式走 addProxy + 指定 networkTypeOther
        cfg.mode = "manual".into();
        cfg.server = " 127.0.0.1 ".into();
        cfg.port = "1080".into();
        let reqs = proxy_requests(&cfg);
        assert_eq!(types(&cfg), vec!["addProxy", "setNetworkType"]);
        assert_eq!(reqs[0]["proxy"]["server"], "127.0.0.1", "server 应 trim");
        assert_eq!(reqs[0]["proxy"]["port"], 1080);
        assert_eq!(reqs[0]["proxy"]["type"]["@type"], "proxyTypeHttp");

        cfg.proxy_type = "mtproto".into();
        assert_eq!(
            proxy_requests(&cfg)[0]["proxy"]["type"]["@type"],
            "proxyTypeMtproto"
        );

        // Web 代理：path + secret 都要带过去
        cfg.proxy_type = "web".into();
        cfg.path = "relay".into();
        cfg.secret = "00112233445566778899aabbccddeeff".into();
        let req = &proxy_requests(&cfg)[0]["proxy"]["type"];
        assert_eq!(req["@type"], "proxyTypeWeb");
        assert_eq!(req["path"], "relay");
        assert_eq!(req["secret"], "00112233445566778899aabbccddeeff");
    }
}
