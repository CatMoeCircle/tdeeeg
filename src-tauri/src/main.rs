// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 设置 WebView2 启动参数
    #[cfg(target_os = "windows")]
    {
        // 开发环境下开启 WebView2 远程调试端口，方便用 Chrome DevTools 连接
        #[cfg(debug_assertions)]
        const EXTRA_ARGS: &[&str] = &["--remote-debugging-port=9222"];
        #[cfg(not(debug_assertions))]
        const EXTRA_ARGS: &[&str] = &[];

        let mut args = vec![
            // HardwareMediaKeyHandling 在 Windows 默认开启，会让 WebView2 进程
            // 经 MediaKeysListenerManager 创建自己的 SMTC 单例，与宿主 Rust 原生
            // SMTC 抢系统媒体会话（源应用显示 msedgewebview2 / 未知应用）。
            // 关掉后 WebView2 不再向 Windows 注册媒体会话，只保留原生一条。
            // 仅影响 WebView2 的媒体键/SMTC 集成，不影响 HTML5 Audio 出声。
            "--disable-features=ElasticOverscroll,HardwareMediaKeyHandling",
            "--enable-features=msWebView2EnableDraggableRegions",
        ];
        args.extend(EXTRA_ARGS);
        let joined = args.join(" ");
        // SAFETY: 在 main 入口、多线程启动前设置环境变量，安全。
        unsafe {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &joined);
        }
    }

    tdeeeg_lib::run()
}
