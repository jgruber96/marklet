//! File access for the front end. Text crosses the bridge with `\n` line
//! endings and no BOM; the original line ending and BOM are reported on read
//! and restored on write so files keep their on-disk format.

use serde::Serialize;
use std::path::Path;

const BOM: &str = "\u{feff}";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContents {
    text: String,
    line_ending: &'static str,
    bom: bool,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<FileContents, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    let raw = String::from_utf8(bytes).map_err(|_| format!("{path} is not valid UTF-8"))?;
    let bom = raw.starts_with(BOM);
    let body = raw.strip_prefix(BOM).unwrap_or(&raw);
    let line_ending = if body.contains("\r\n") { "\r\n" } else { "\n" };
    Ok(FileContents {
        text: body.replace("\r\n", "\n"),
        line_ending,
        bom,
    })
}

#[tauri::command]
pub fn write_file(path: String, text: String, line_ending: String, bom: bool) -> Result<(), String> {
    let mut out = String::with_capacity(text.len() + 8);
    if bom {
        out.push_str(BOM);
    }
    if line_ending == "\r\n" {
        out.push_str(&text.replace("\r\n", "\n").replace('\n', "\r\n"));
    } else {
        out.push_str(&text);
    }

    // Write to a sibling temp file, then rename over the target so a crash
    // mid-write never leaves a truncated document.
    let target = Path::new(&path);
    let tmp = target.with_extension("nova-md-tmp");
    std::fs::write(&tmp, out.as_bytes()).map_err(|e| format!("Could not write {path}: {e}"))?;
    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Could not save {path}: {e}")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> String {
        std::env::temp_dir().join(name).to_string_lossy().into_owned()
    }

    #[test]
    fn crlf_and_bom_survive_a_round_trip() {
        let path = temp_path("nova-md-test-crlf.md");
        let original = "\u{feff}# Title\r\n\r\nBody line\r\n";
        std::fs::write(&path, original).unwrap();

        let read = read_file(path.clone()).unwrap();
        assert_eq!(read.text, "# Title\n\nBody line\n");
        assert_eq!(read.line_ending, "\r\n");
        assert!(read.bom);

        write_file(path.clone(), read.text + "More\n", read.line_ending.into(), read.bom).unwrap();
        let bytes = std::fs::read_to_string(&path).unwrap();
        assert_eq!(bytes, "\u{feff}# Title\r\n\r\nBody line\r\nMore\r\n");
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn lf_files_stay_lf_without_bom() {
        let path = temp_path("nova-md-test-lf.md");
        std::fs::write(&path, "a\nb\n").unwrap();
        let read = read_file(path.clone()).unwrap();
        assert_eq!(read.line_ending, "\n");
        assert!(!read.bom);
        write_file(path.clone(), read.text, read.line_ending.into(), read.bom).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"a\nb\n");
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn non_utf8_is_rejected() {
        let path = temp_path("nova-md-test-latin1.md");
        std::fs::write(&path, [0x63, 0x61, 0x66, 0xe9]).unwrap();
        assert!(read_file(path.clone()).is_err());
        std::fs::remove_file(&path).unwrap();
    }
}
