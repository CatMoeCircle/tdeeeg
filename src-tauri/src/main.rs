// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 设置 WebView2 启动参数
    #[cfg(target_os = "windows")]
    {
        let mut args = vec![
            "--disable-features=ElasticOverscroll",
            "--enable-features=msWebView2EnableDraggableRegions",
        ];
        // 开发环境下开启 WebView2 远程调试端口，方便用 Chrome DevTools 连接
        #[cfg(debug_assertions)]
        {
            args.push("--remote-debugging-port=9222");
        }
        let joined = args.join(" ");
        // SAFETY: 在 main 入口、多线程启动前设置环境变量，安全。
        unsafe {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &joined);
        }
    }

    tdeeeg_lib::run()
}
