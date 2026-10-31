//! Watches the workspace folder and tells the front end what changed, so the
//! tree and open tabs pick up edits made outside the app.

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use tauri::{AppHandle, Emitter, State};

use crate::fs::is_skipped_dir;

/// Changes inside this window are batched into one event.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// The active watcher; replacing or dropping it stops the old one.
#[derive(Default)]
pub struct FolderWatcher(Mutex<Option<Debouncer<RecommendedWatcher>>>);

/// Starts watching `root` recursively, replacing any earlier watch. Emits
/// `fs-change` with the changed paths.
#[tauri::command]
pub fn watch_folder(app: AppHandle, state: State<FolderWatcher>, root: String) -> Result<(), String> {
    let root_path = Path::new(&root).to_path_buf();
    let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        let paths: Vec<String> = events
            .into_iter()
            .filter(|e| is_relevant(&root_path, &e.path))
            .map(|e| e.path.to_string_lossy().into_owned())
            .collect();
        if !paths.is_empty() {
            let _ = app.emit("fs-change", paths);
        }
    })
    .map_err(|e| format!("Could not watch {root}: {e}"))?;
    debouncer
        .watcher()
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| format!("Could not watch {root}: {e}"))?;
    *state.0.lock().unwrap() = Some(debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch_folder(state: State<FolderWatcher>) {
    *state.0.lock().unwrap() = None;
}

/// Skips the save temp file and anything inside hidden or build folders.
fn is_relevant(root: &Path, path: &Path) -> bool {
    if path.extension().is_some_and(|e| e == "nova-md-tmp") {
        return false;
    }
    let rel = path.strip_prefix(root).unwrap_or(path);
    let mut parts: Vec<_> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    parts.pop(); // the changed entry itself may be a dot-file note; only its folders count
    !parts.iter().any(|p| is_skipped_dir(p))
}
