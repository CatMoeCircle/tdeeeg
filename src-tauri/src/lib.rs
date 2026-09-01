// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod chat_store;
mod data_loc;
mod download_store;
mod media_stream;
mod tdlib;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent,
};

#[tauri::command]
fn set_window_effect(window: tauri::WebviewWindow, effect: String) -> Result<(), String> {
    use tauri::window::{Effect, EffectsBuilder};

    let effects = match effect.as_str() {
        "acrylic" => EffectsBuilder::new().effect(Effect::Acrylic).build(),
        "mica" => EffectsBuilder::new().effect(Effect::Mica).build(),
        "tabbed" => EffectsBuilder::new().effect(Effect::Tabbed).build(),
        "blur" => EffectsBuilder::new().effect(Effect::Blur).build(),
        _ => return Err(format!("Unknown effect: {}", effect)),
    };

    window.set_effects(effects).map_err(|e| e.to_string())
}

/// 用系统「打开方式」对话框选择应用打开文件（Windows 触发 OpenAs_RunDLL）。
/// 非 Windows 平台退回系统默认程序打开。
#[tauri::command]
fn open_with_dialog(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // rundll32 shell32.dll,OpenAs_RunDLL <file> 会弹出「打开方式」对话框
        Command::new("rundll32.exe")
            .args(["shell32.dll", "OpenAs_RunDLL", &path])
            .spawn()
            .map_err(|e| format!("Failed to open 'Open with' dialog: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        tauri_plugin_opener::open_path(path, None::<String>).map_err(|e| e.to_string())
    }
}

/// 把本地图片文件原生写入系统剪贴板。
/// WebView2 的 `navigator.clipboard.write()` 只支持 image/png，且大图异步写入慢、
/// 失败时可能清空剪贴板；这里用 image 解码为 RGBA 后经 arboard 直接写入
/// Windows 剪贴板（CF_DIB），立即生效、支持任意格式。后台线程执行，不阻塞 UI。
#[tauri::command]
async fn copy_image_to_clipboard(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&path)
            .map_err(|e| format!("decode image failed: {e}"))?
            .into_rgba8();
        let (w, h) = img.dimensions();
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        clipboard
            .set_image(arboard::ImageData {
                width: w as usize,
                height: h as usize,
                bytes: img.into_raw().into(),
            })
            .map_err(|e| format!("set clipboard failed: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("clipboard task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例插件必须最先注册
        .plugin(
            tauri_plugin_single_instance::Builder::new()
                .callback(|app, _argv, _cwd| {
                    // 第二个实例启动时，聚焦已有窗口
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("tdstream", |context, request, responder| {
            media_stream::respond(context.app_handle().clone(), request, responder);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // 根据持久化的数据存储模式解析数据根目录（AppData 或应用自带目录）
            let data_dir =
                data_loc::resolve_current_data_dir(app.handle()).map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            app.manage(tdlib::AppState::new(data_dir));

            // ===== 系统托盘 =====
            let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("tdeeeg")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button_state: MouseButtonState::Down,
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ===== 拦截窗口关闭事件：隐藏而非销毁 =====
            let app_handle = app.handle().clone();
            let main_window = app.get_webview_window("main").unwrap();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // 阻止默认关闭行为，改为隐藏窗口
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tdlib::init_tdlib,
            tdlib::tdlib_send,
            tdlib::set_tdlib_parameters,
            tdlib::set_proxy_config,
            tdlib::restart_tdlib,
            tdlib::logout_tdlib,
            tdlib::get_chat_list,
            tdlib::get_chat_lists,
            tdlib::get_downloads,
            tdlib::get_download_active_count,
            tdlib::register_download,
            tdlib::dismiss_download,
            tdlib::clear_completed_downloads,
            tdlib::get_show_hidden_downloads,
            tdlib::set_show_hidden_downloads,
            tdlib::get_show_auto_photos_downloads,
            tdlib::set_show_auto_photos_downloads,
            tdlib::get_uploads,
            tdlib::dismiss_upload,
            tdlib::get_cached_connection_state,
            tdlib::get_cached_options,
            tdlib::get_cached_option,
            tdlib::get_system_proxy,
            tdlib::get_data_location,
            tdlib::migrate_data_dir,
            set_window_effect,
            open_with_dialog,
            copy_image_to_clipboard,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                // 所有窗口关闭时阻止退出（托盘仍在运行）
                // code.is_none() 表示是窗口全部关闭触发的，非 app.exit() 调用
                RunEvent::ExitRequested { code, api, .. } => {
                    if code.is_none() {
                        api.prevent_exit();
                    }
                }
                _ => {}
            }
        });
}
