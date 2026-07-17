// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod chat_store;
mod tdlib;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(tdlib::AppState::new())
        .invoke_handler(tauri::generate_handler![
            tdlib::init_tdlib,
            tdlib::tdlib_send,
            tdlib::set_tdlib_parameters,
            tdlib::get_chat_list,
            tdlib::get_chat_lists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
