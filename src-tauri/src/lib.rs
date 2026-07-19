// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod chat_store;
mod tdlib;

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(tdlib::AppState::new())
        .invoke_handler(tauri::generate_handler![
            tdlib::init_tdlib,
            tdlib::tdlib_send,
            tdlib::set_tdlib_parameters,
            tdlib::get_chat_list,
            tdlib::get_chat_lists,
            set_window_effect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
