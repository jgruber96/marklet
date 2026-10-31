//! Files the OS asks Nova MD to open: double-clicked `.md` files (command-line
//! arguments on Windows, open events on macOS), including when the app is
//! already running.

use std::path::Path;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

use crate::fs::is_markdown;

/// Files waiting for the front end, and whether it has started listening.
#[derive(Default)]
pub struct LaunchFiles(Mutex<(Vec<String>, bool)>);

/// Markdown files among command-line arguments (the first is the program).
pub fn files_from_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && is_markdown(Path::new(a)) && Path::new(a).is_file())
        .collect()
}

/// Hands files to the front end now if it is listening, else queues them.
pub fn open_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    let state = app.state::<LaunchFiles>();
    let mut guard = state.0.lock().unwrap();
    if guard.1 {
        let _ = app.emit("open-files", files);
    } else {
        guard.0.extend(files);
    }
}

/// Called once by the front end when it is ready: returns queued files, and
/// later ones arrive as `open-files` events.
#[tauri::command]
pub fn take_launch_files(state: tauri::State<LaunchFiles>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    guard.1 = true;
    std::mem::take(&mut guard.0)
}

/// A second launch (double-clicking another file) forwards its files here and
/// brings the existing window forward.
pub fn on_second_instance(app: &AppHandle, args: Vec<String>, _cwd: String) {
    open_files(app, files_from_args(args));
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
