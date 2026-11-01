mod tablet;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(tablet::PenSink::default())
        .setup(|app| {
            tablet::install(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tablet::tablet_available,
            tablet::tablet_subscribe
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
