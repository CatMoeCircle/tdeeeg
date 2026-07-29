// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod chat_store;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("tdstream", |context, request, responder| {
            media_stream::respond(context.app_handle().clone(), request, responder);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            app.manage(tdlib::AppState::new(data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tdlib::init_tdlib,
            tdlib::tdlib_send,
            tdlib::set_tdlib_parameters,
            tdlib::get_chat_list,
            tdlib::get_chat_lists,
            tdlib::get_downloads,
            tdlib::get_download_active_count,
            tdlib::register_download,
            tdlib::dismiss_download,
            tdlib::clear_completed_downloads,
            tdlib::get_show_hidden_downloads,
            tdlib::set_show_hidden_downloads,
            tdlib::get_cached_connection_state,
            tdlib::get_cached_options,
            tdlib::get_cached_option,
            set_window_effect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
