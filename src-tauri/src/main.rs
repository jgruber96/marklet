// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod fs;
mod menu;
mod watcher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(watcher::FolderWatcher::default())
        .setup(|app| {
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(menu::handle_event)
        .invoke_handler(tauri::generate_handler![
            fs::read_file,
            fs::write_file,
            fs::list_folder,
            fs::create_file,
            fs::rename_path,
            fs::trash_path,
            watcher::watch_folder,
            watcher::unwatch_folder,
            menu::sync_theme_menu,
            menu::set_menu_checked
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nova MD");
}
