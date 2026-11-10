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
    let tmp = target.with_extension("marklet-tmp");
    std::fs::write(&tmp, out.as_bytes()).map_err(|e| format!("Could not write {path}: {e}"))?;
    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Could not save {path}: {e}")
    })
}

/// One row of the workspace tree: a Markdown file, or a folder that holds some.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
}

/// Folders that never hold notes but can hold a great many files.
const SKIPPED_DIRS: [&str; 3] = ["node_modules", "target", "dist"];
const MAX_DEPTH: usize = 16;
const MAX_FILES: usize = 10_000;

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
}

/// Hidden and build folders are left out of the tree and ignored by the watcher.
pub fn is_skipped_dir(name: &str) -> bool {
    name.starts_with('.') || SKIPPED_DIRS.contains(&name)
}

/// Every `.md` / `.markdown` file under `root`, folders first, then by name.
/// Folders without any Markdown file inside are left out.
#[tauri::command]
pub async fn list_folder(root: String) -> Result<Vec<TreeNode>, String> {
    let mut budget = MAX_FILES;
    list_dir(Path::new(&root), 0, &mut budget).map_err(|e| format!("Could not read {root}: {e}"))
}

fn list_dir(dir: &Path, depth: usize, budget: &mut usize) -> std::io::Result<Vec<TreeNode>> {
    let mut nodes = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let Ok(entry) = entry else { continue };
        // file_type() does not follow symlinks, so link loops can't recurse forever.
        let Ok(kind) = entry.file_type() else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        if kind.is_dir() {
            if is_skipped_dir(&name) || depth >= MAX_DEPTH {
                continue;
            }
            // Unreadable subfolders are skipped rather than failing the whole tree.
            let children = list_dir(&path, depth + 1, budget).unwrap_or_default();
            if !children.is_empty() {
                nodes.push(TreeNode { name, path: path_string(&path), is_dir: true, children: Some(children) });
            }
        } else if kind.is_file() && is_markdown(&path) && *budget > 0 {
            *budget -= 1;
            nodes.push(TreeNode { name, path: path_string(&path), is_dir: false, children: None });
        }
    }
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(nodes)
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Creates an empty file (and any missing parent folders); fails if it exists.
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map(|_| ())
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => format!("{path} already exists."),
            _ => format!("Could not create {path}: {e}"),
        })
}

/// Renames a file or folder; refuses to overwrite anything already at `to`.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    // A case-only rename names the same file on Windows and macOS, so it is allowed.
    let case_only = from.to_lowercase() == to.to_lowercase();
    if !case_only && Path::new(&to).exists() {
        return Err(format!("{to} already exists."));
    }
    std::fs::rename(&from, &to).map_err(|e| format!("Could not rename {from}: {e}"))
}

/// Moves a file or folder to the Recycle Bin / Trash, so a delete can be undone there.
#[tauri::command]
pub async fn trash_path(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Could not move {path} to the trash: {e}"))
}

/// Largest pasted image that is saved (before base64 encoding).
const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;

/// A file name safe on Windows and macOS: no folders, no reserved characters.
fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"\/:*?"<>|"#.contains(c) { '-' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim();
    if cleaned.is_empty() { "image".into() } else { cleaned.to_string() }
}

/// Saves a pasted image (base64 `data`) into `dir`, creating the folder if
/// needed. Never overwrites: a taken name gets `-1`, `-2`, … before the
/// extension. Returns the file name used.
#[tauri::command]
pub async fn save_image(dir: String, name: String, data: String) -> Result<String, String> {
    use base64::Engine;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "The pasted image could not be read.".to_string())?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("That image is too large to paste (the limit is 25 MB).".into());
    }
    write_unique(&dir, &name, &bytes)
}

/// Copies an image file dropped onto the editor into `dir`, like a pasted one. Returns the file name used.
#[tauri::command]
pub async fn import_image(dir: String, source: String) -> Result<String, String> {
    let src = Path::new(&source);
    let size = std::fs::metadata(src).map_err(|e| format!("Could not read {source}: {e}"))?.len();
    if size > MAX_IMAGE_BYTES as u64 {
        return Err("That image is too large to add (the limit is 25 MB).".into());
    }
    let bytes = std::fs::read(src).map_err(|e| format!("Could not read {source}: {e}"))?;
    let name = src.file_name().and_then(|n| n.to_str()).unwrap_or("image");
    write_unique(&dir, name, &bytes)
}

/// Writes `bytes` into `dir` (created if needed) under a safe form of `name`,
/// never overwriting: a taken name gets `-1`, `-2`, … before the extension.
fn write_unique(dir: &str, name: &str, bytes: &[u8]) -> Result<String, String> {
    use std::io::Write;

    let folder = Path::new(dir);
    std::fs::create_dir_all(folder).map_err(|e| format!("Could not create {dir}: {e}"))?;

    let name = safe_file_name(name);
    let as_path = Path::new(&name);
    let stem = as_path.file_stem().and_then(|s| s.to_str()).unwrap_or("image").to_string();
    let ext = as_path.extension().and_then(|e| e.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    for n in 0..10_000 {
        let candidate = if n == 0 { format!("{stem}{ext}") } else { format!("{stem}-{n}{ext}") };
        // create_new fails if the name is taken, so two pastes can never collide.
        match std::fs::OpenOptions::new().write(true).create_new(true).open(folder.join(&candidate)) {
            Ok(mut file) => {
                return file
                    .write_all(bytes)
                    .map(|_| candidate)
                    .map_err(|e| format!("Could not save the image: {e}"));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Could not save the image: {e}")),
        }
    }
    Err("Could not find a free file name for the image.".into())
}

/// What a dropped path is: "dir", "file" or "none".
#[tauri::command]
pub fn path_kind(path: String) -> &'static str {
    match std::fs::metadata(&path) {
        Ok(m) if m.is_dir() => "dir",
        Ok(m) if m.is_file() => "file",
        _ => "none",
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    path: String,
    /// 0-based line and column (in UTF-16 units, as the editor counts) of the match.
    line: usize,
    column: usize,
    /// The matching line, trimmed and shortened around the match.
    text: String,
    /// Where the match sits in `text`, in UTF-16 units.
    start: usize,
    length: usize,
}

const MAX_HITS: usize = 500;
const MAX_SEARCHED_BYTES: u64 = 5 * 1024 * 1024;
const SNIPPET_BEFORE: usize = 30;
const SNIPPET_AFTER: usize = 90;

/// Every line containing `query` (ignoring case) in the Markdown files under `root`, in tree order.
#[tauri::command]
pub async fn search_folder(root: String, query: String) -> Result<Vec<SearchHit>, String> {
    let needle: Vec<char> = query.to_lowercase().chars().collect();
    let mut hits = Vec::new();
    if needle.is_empty() {
        return Ok(hits);
    }
    let tree = list_folder(root).await?;
    search_nodes(&tree, &needle, &mut hits);
    Ok(hits)
}

fn search_nodes(nodes: &[TreeNode], needle: &[char], hits: &mut Vec<SearchHit>) {
    for node in nodes {
        if hits.len() >= MAX_HITS {
            return;
        }
        if let Some(children) = &node.children {
            search_nodes(children, needle, hits);
        } else if std::fs::metadata(&node.path).is_ok_and(|m| m.len() <= MAX_SEARCHED_BYTES) {
            if let Ok(bytes) = std::fs::read(&node.path) {
                search_text(&node.path, &String::from_utf8_lossy(&bytes), needle, hits);
            }
        }
    }
}

fn search_text(path: &str, text: &str, needle: &[char], hits: &mut Vec<SearchHit>) {
    let utf16 = |chars: &[char]| chars.iter().map(|c| c.len_utf16()).sum::<usize>();
    for (line, raw) in text.trim_start_matches('\u{feff}').lines().enumerate() {
        if hits.len() >= MAX_HITS {
            return;
        }
        let chars: Vec<char> = raw.chars().collect();
        // Compare character by character so positions stay valid when lowercasing changes a length.
        let lower: Vec<char> = chars.iter().map(|c| c.to_lowercase().next().unwrap_or(*c)).collect();
        let Some(at) = lower.windows(needle.len()).position(|w| w == needle) else { continue };
        let from = at.saturating_sub(SNIPPET_BEFORE);
        let to = (at + needle.len() + SNIPPET_AFTER).min(chars.len());
        let lead = if from > 0 { "…" } else { "" };
        let snippet: String = chars[from..to].iter().collect();
        hits.push(SearchHit {
            path: path.to_owned(),
            line,
            column: utf16(&chars[..at]),
            text: format!("{lead}{snippet}{}", if to < chars.len() { "…" } else { "" }),
            start: utf16(&chars[from..at]) + lead.encode_utf16().count(),
            length: utf16(&chars[at..at + needle.len()]),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pasted_images_get_safe_unique_names() {
        use base64::Engine;
        let dir = std::env::temp_dir().join("marklet-test-images").join("assets");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
        let dir_s = dir.to_string_lossy().into_owned();
        let data = base64::engine::general_purpose::STANDARD.encode(b"png-bytes");
        let save = |name: &str| tauri::async_runtime::block_on(save_image(dir_s.clone(), name.into(), data.clone()));

        assert_eq!(save("shot.png").unwrap(), "shot.png");
        assert_eq!(save("shot.png").unwrap(), "shot-1.png");
        assert_eq!(save("..\\..\\evil:name.png").unwrap(), "-..-evil-name.png");
        assert_eq!(std::fs::read(dir.join("shot-1.png")).unwrap(), b"png-bytes");
        assert!(tauri::async_runtime::block_on(save_image(dir_s.clone(), "x.png".into(), "not base64!".into())).is_err());
        std::fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn search_finds_lines_ignoring_case() {
        let mut hits = Vec::new();
        let needle: Vec<char> = "wörld".chars().collect();
        search_text("a.md", "\u{feff}# Title\nHello WÖRLD and more\nnothing here\n", &needle, &mut hits);
        assert_eq!(hits.len(), 1);
        assert_eq!((hits[0].line, hits[0].column, hits[0].length), (1, 6, 5));
        assert_eq!(&hits[0].text[..], "Hello WÖRLD and more");
        assert_eq!(hits[0].start, 6);
    }

    fn temp_path(name: &str) -> String {
        std::env::temp_dir().join(name).to_string_lossy().into_owned()
    }

    #[test]
    fn crlf_and_bom_survive_a_round_trip() {
        let path = temp_path("marklet-test-crlf.md");
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
        let path = temp_path("marklet-test-lf.md");
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
        let path = temp_path("marklet-test-latin1.md");
        std::fs::write(&path, [0x63, 0x61, 0x66, 0xe9]).unwrap();
        assert!(read_file(path.clone()).is_err());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn tree_lists_markdown_only_and_prunes_empty_folders() {
        let root = std::env::temp_dir().join("marklet-test-tree");
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["notes/deep", "empty", ".git", "node_modules/pkg"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in ["b.md", "A.markdown", "skip.txt", "notes/deep/c.MD", ".git/x.md", "node_modules/pkg/r.md"] {
            std::fs::write(root.join(file), "").unwrap();
        }

        let mut budget = MAX_FILES;
        let tree = list_dir(&root, 0, &mut budget).unwrap();
        let names: Vec<_> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, ["notes", "A.markdown", "b.md"]);
        let deep = &tree[0].children.as_ref().unwrap()[0];
        assert_eq!(deep.name, "deep");
        assert_eq!(deep.children.as_ref().unwrap()[0].name, "c.MD");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn create_and_rename_refuse_to_overwrite() {
        let dir = std::env::temp_dir().join("marklet-test-ops");
        let _ = std::fs::remove_dir_all(&dir);
        let a = dir.join("sub/a.md").to_string_lossy().into_owned();
        let b = dir.join("b.md").to_string_lossy().into_owned();
        create_file(a.clone()).unwrap();
        assert!(create_file(a.clone()).is_err());
        std::fs::write(&b, "keep").unwrap();
        assert!(rename_path(a.clone(), b.clone()).is_err());
        assert_eq!(std::fs::read_to_string(&b).unwrap(), "keep");
        let a_upper = dir.join("sub/A.md").to_string_lossy().into_owned();
        rename_path(a, a_upper.clone()).unwrap();
        assert!(Path::new(&a_upper).exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
