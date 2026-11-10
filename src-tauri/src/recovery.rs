//! Recovery copies of unsaved documents, kept in the app's data folder so a
//! crash or power cut does not lose them. The front end decides what goes in
//! a copy (JSON) and when; this only stores, lists and removes the files.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("recovery"))
}

/// Copy names are made by the front end (`<run>-<tab>`); nothing else is accepted as a file name.
fn is_safe_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !is_safe_name(name) {
        return Err(format!("Not a recovery copy name: {name}"));
    }
    Ok(folder(app)?.join(format!("{name}.json")))
}

#[tauri::command]
pub fn recovery_write(app: AppHandle, name: String, data: String) -> Result<(), String> {
    let path = file(&app, &name)?;
    fs::create_dir_all(folder(&app)?).map_err(|e| e.to_string())?;
    // Write beside the copy and rename over it, so a crash mid-write leaves the previous copy intact.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recovery_remove(app: AppHandle, name: String) -> Result<(), String> {
    match fs::remove_file(file(&app, &name)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Every stored copy as (name, contents), oldest name first.
#[tauri::command]
pub fn recovery_list(app: AppHandle) -> Result<Vec<(String, String)>, String> {
    let Ok(entries) = fs::read_dir(folder(&app)?) else { return Ok(Vec::new()) };
    let mut copies = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        if path.extension().and_then(|e| e.to_str()) != Some("json") || !is_safe_name(name) {
            continue;
        }
        if let Ok(data) = fs::read_to_string(&path) {
            copies.push((name.to_owned(), data));
        }
    }
    copies.sort();
    Ok(copies)
}

#[cfg(test)]
mod tests {
    use super::is_safe_name;

    #[test]
    fn only_plain_names_become_files() {
        assert!(is_safe_name("mh3k2a9-12"));
        for bad in ["", "..", "a/b", "a\\b", "a.json", "C:x", &"x".repeat(65)] {
            assert!(!is_safe_name(bad), "{bad}");
        }
    }
}
