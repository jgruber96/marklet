//! Marklet's Rust side. `run()` starts the app on every platform: main.rs
//! calls it on desktop, and iOS calls it through `mobile_entry_point`.
//!
//! Desktop-only pieces (native menu, folder watcher, system trash, window
//! state, single instance, self-update) are behind `#[cfg(desktop)]`; tauri-build
//! sets `desktop` or `mobile` for the target being built.

mod export;
mod fs;
mod launch;
#[cfg(desktop)]
mod menu;
mod recovery;
#[cfg(desktop)]
mod watcher;

/// 0.1.0 first shipped as "Nova MD" (us.darkstardev.novamd). On the first run
/// under the new identifier, copy its settings (theme, accent, autosave, last
/// session) across. Runs before the front end opens the store.
#[cfg(desktop)]
fn carry_over_settings(app: &tauri::AppHandle) {
    use tauri::Manager;
    // Only the real app inherits them: a test profile (another identifier) must start empty.
    if app.config().identifier != "us.darkstardev.marklet" {
        return;
    }
    let Ok(dir) = app.path().app_data_dir() else { return };
    let Some(old) = dir.parent().map(|p| p.join("us.darkstardev.novamd").join("settings.json")) else { return };
    let new = dir.join("settings.json");
    if !new.exists() && old.is_file() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::copy(old, new);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Must be registered first, so a second launch exits before doing anything else.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(launch::on_second_instance));

    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(launch::LaunchFiles::default());

    #[cfg(desktop)]
    let builder = builder
        // Size and position are remembered; whether the window has a native frame is the app's choice, not saved state.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::DECORATIONS)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(watcher::FolderWatcher::default())
        .on_menu_event(menu::handle_event)
        .setup(|app| {
            carry_over_settings(app.handle());
            let menu = menu::build(app.handle())?;
            // macOS shows it as the menu bar. On Windows the window has no native frame
            // (tauri.windows.conf.json): the front end draws the same menu itself, under a
            // toolbar button, and handles the shortcuts.
            if cfg!(target_os = "macos") {
                app.set_menu(menu)?;
            }
            launch::open_files(app.handle(), launch::files_from_args(std::env::args()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs::read_file,
            export::read_image_data_uri,
            export::print_to_pdf,
            fs::write_file,
            fs::list_folder,
            fs::create_file,
            fs::rename_path,
            fs::trash_path,
            fs::save_image,
            fs::import_image,
            fs::path_kind,
            fs::search_folder,
            menu::set_recent_menu,
            recovery::recovery_write,
            recovery::recovery_remove,
            recovery::recovery_list,
            watcher::watch_folder,
            watcher::unwatch_folder,
            menu::check_menu_group,
            menu::set_menu_checked,
            launch::take_launch_files
        ]);

    // iOS: no menu or watcher commands; the workspace is the app's Documents folder.
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        fs::read_file,
        export::read_image_data_uri,
        export::print_to_pdf,
        fs::write_file,
        fs::list_folder,
        fs::create_file,
        fs::rename_path,
        fs::trash_path,
        fs::save_image,
        fs::import_image,
        fs::path_kind,
        fs::search_folder,
        fs::mobile_workspace,
        recovery::recovery_write,
        recovery::recovery_remove,
        recovery::recovery_list,
        launch::take_launch_files
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building Marklet")
        .run(|_app, _event| {
            // macOS and iOS deliver opened files ("Open in Marklet") as an event, not as arguments.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                let files = urls.into_iter().filter_map(|u| u.to_file_path().ok());
                let files = files.map(|p| p.to_string_lossy().into_owned()).collect();
                launch::open_files(_app, files);
            }
        });
}
