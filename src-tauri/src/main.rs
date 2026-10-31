// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod export;
mod fs;
mod launch;
mod menu;
mod watcher;

fn main() {
    tauri::Builder::default()
        // Must be registered first, so a second launch exits before doing anything else.
        .plugin(tauri_plugin_single_instance::init(launch::on_second_instance))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(watcher::FolderWatcher::default())
        .manage(launch::LaunchFiles::default())
        .setup(|app| {
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;
            launch::open_files(app.handle(), launch::files_from_args(std::env::args()));
            Ok(())
        })
        .on_menu_event(menu::handle_event)
        .invoke_handler(tauri::generate_handler![
            fs::read_file,
            export::read_image_data_uri,
            export::print_to_pdf,
            fs::write_file,
            fs::list_folder,
            fs::create_file,
            fs::rename_path,
            fs::trash_path,
            watcher::watch_folder,
            watcher::unwatch_folder,
            menu::check_menu_group,
            menu::set_menu_checked,
            launch::take_launch_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building Nova MD")
        .run(|_app, _event| {
            // macOS delivers double-clicked files as an event, not as arguments.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let files = urls.into_iter().filter_map(|u| u.to_file_path().ok());
                let files = files.map(|p| p.to_string_lossy().into_owned()).collect();
                launch::open_files(_app, files);
            }
        });
}
