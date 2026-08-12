// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod chat_store;
mod data_loc;
mod download_store;
mod media_stream;
mod tdlib;

use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
