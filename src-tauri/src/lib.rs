mod storage;
mod tablet;

/// Whether this build updates itself (see the `updater` feature).
#[tauri::command]
fn updates_enabled() -> bool {
    cfg!(feature = "updater")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "updater")]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(tablet::PenSink::default())
        .setup(|app| {
            tablet::install(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            updates_enabled,
            tablet::tablet_available,
            tablet::tablet_subscribe,
            storage::data_read,
            storage::data_write,
            storage::data_read_bytes,
            storage::data_write_bytes,
            storage::data_remove,
            storage::file_read,
            storage::file_write
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
