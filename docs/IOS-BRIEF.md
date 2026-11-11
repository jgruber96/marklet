# Marklet for iOS — Port Brief

Nov 11, 2026 · @Jeff · based on Marklet 0.4.3 (`jgruber96/marklet`)

## Overview

Bring Marklet to iPhone and iPad from the same repo. Marklet is already Tauri 2 + React, and Tauri 2 builds iOS apps directly, so this is a **port, not a rewrite**: the React front end, CodeMirror editor, markdown-it/Shiki/KaTeX/Mermaid preview and most of the Rust file code carry over. The work is replacing the desktop-only pieces (menus, folder watcher, trash, updater, print-to-PDF, window plugins) and redesigning the layout for touch and small screens.

- **Platforms:** iPadOS 17+ and iOS 17+ (one universal app). iPad is the primary target; iPhone gets a single-pane layout.
- **Bundle ID:** `us.darkstardev.marklet` (same as desktop). Publisher: DarkstarDEV.
- **Distribution:** TestFlight first, then the App Store. The in-app updater is not used on iOS.
- **Goal:** the same plain-`.md`-files-on-disk model as desktop, with no account or database.

## Requirements

- A Mac with Xcode 16+ (iOS builds cannot be made on Windows), plus the iOS Rust targets: `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`
- An Apple Developer Program membership ($99/yr) for device installs, TestFlight and the App Store
- `npm run tauri ios init` generates `src-tauri/gen/apple` (the Xcode project); commit it

## Where files live (the main design decision)

iOS apps are sandboxed: Marklet can't browse arbitrary folders the way it does on desktop.

| Option | How | Verdict |
| --- | --- | --- |
| **App's Documents folder, visible in Files** | Set `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` in Info.plist; the workspace root is the app's Documents dir | **v1.** Existing `std::fs` code in `fs.rs` works unchanged inside it |
| iCloud Drive container | Add an iCloud container entitlement; workspace root is the ubiquity container | **v1.1.** Gives Mac/iPhone sync for free; needs conflict handling |
| Any folder the user picks (e.g. a Dropbox folder) | `UIDocumentPickerViewController` + security-scoped bookmarks, via a small Swift Tauri plugin | Later. Most work; needed for "open my existing notes folder" |

Opening a single `.md` from the Files app ("Open in Marklet") should work in v1: declare `CFBundleDocumentTypes` for `md`/`markdown` and handle the opened-URL event (today's `RunEvent::Opened` handler in `main.rs` is macOS-only; extend it to iOS and verify the event fires there).

## Desktop pieces and their iOS replacement

| Desktop piece (file) | On iOS |
| --- | --- |
| Native menu bar + custom Windows menu (`menu.rs`, App menu events) | No menus. Move every action to the toolbar, a "⋯" sheet and iPad keyboard shortcuts (keep the existing `keydown` handler; it works with hardware keyboards). Gate `menu.rs` and its commands behind `#[cfg(desktop)]` |
| `tauri-plugin-single-instance`, `-window-state` | Remove on mobile (`#[cfg(desktop)]`); iOS has one window per scene |
| `tauri-plugin-updater`, `-process` (`update.ts`) | Remove on mobile; skip `checkForUpdate()` when not desktop. App Store handles updates |
| Folder watcher (`watcher.rs`, `notify`) | Don't watch. Re-list the folder and re-check open tabs' mtimes when the app returns to the foreground. Keeps the `fs-change` event shape so the front end barely changes |
| Delete to trash (`trash` crate) | No system trash. Confirm, then move to a hidden `.marklet-trash` folder (or delete outright). Gate the `trash` dependency to desktop |
| PDF export (`export.rs`, WebView2 / `window.print()`) | Use WKWebView `createPDF` via `with_webview`, then present the iOS share sheet so the user saves to Files, AirDrops or prints |
| HTML export / Save As (`plugin-dialog` `save()`) | Write to a temp file and hand it to the share sheet ("Export…"). Test what `plugin-dialog` `save`/`open({ directory: true })` actually support on iOS before relying on them |
| Drag and drop (`onDragDropEvent` in App.tsx) | Desktop only. Add "Insert photo" (`<input type="file" accept="image/*">` → existing `save_image`) and keep paste. iPad drag-in is a later nice-to-have |
| Recent files, window title | Recent list moves into the sidebar; no title to set |
| Custom title bar (`tauri.windows.conf.json`) | Not used. Respect safe areas instead (below) |
| Nova MD settings carry-over (`main.rs`) | Desktop only |
| Platform check `isMac = userAgent.includes("Mac")` (App.tsx) | **Bug on iPad:** iPadOS reports a Mac user agent. Switch to `@tauri-apps/plugin-os` `platform()` and add an `isMobile` flag |

Everything else in Rust (`read_file`, `write_file` with line endings/BOM, `list_folder`, `create_file`, `rename_path`, `save_image`, `search_folder`, `recovery.rs`) should compile and work on iOS as-is within the sandbox.

## Rust/Tauri restructuring

1. Move `main()`'s builder into `src-tauri/src/lib.rs` as `pub fn run()` with `#[cfg_attr(mobile, tauri::mobile_entry_point)]`; `main.rs` just calls `marklet_lib::run()`.
2. In `Cargo.toml` add `[lib] name = "marklet_lib"`, `crate-type = ["staticlib", "cdylib", "rlib"]`, and move desktop-only crates under `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`.
3. Split the `invoke_handler` list so desktop-only commands are only registered on desktop; add the iOS replacements (`export_pdf_ios`, `refresh_folder`).
4. Split capabilities: keep `default.json` for desktop (`"platforms": ["windows", "macOS"]`), add `mobile.json` with `"platforms": ["iOS"]` and only store, opener, clipboard and dialog.
5. Add an iOS icon set (`npm run tauri icon docs/icon/marklet-1024.png` generates it into the Xcode project).

## UI for touch and small screens

| Area | iPad | iPhone |
| --- | --- | --- |
| Layout | Current sidebar + split view; sidebar collapses into an overlay in portrait | One pane at a time: file list → document; Editor / Preview / Rich toggle in the toolbar |
| Tabs | Keep the tab strip | Replace with a document switcher (recent open files) |
| Formatting | Toolbar as today | Keyboard accessory bar above the on-screen keyboard: bold, italic, heading, link, code, list, task, undo |
| Settings | Sheet instead of a window | Same |

- **Safe areas:** set `viewport-fit=cover` in `index.html` and pad the toolbar/status bar with `env(safe-area-inset-*)`.
- **Keyboard:** resize the editor when the on-screen keyboard opens (`visualViewport` resize) so the cursor never hides behind it.
- **Editor input:** turn off autocapitalize/autocorrect inside code blocks and fences; keep system spell check (`spellcheck.ts`) for prose. Test CodeMirror selection handles and Rich view table editing by touch.
- **Hit targets:** at least 44 pt for toolbar buttons, tree rows and outline items.
- **Saving:** autosave stays on by default, and also save when the app moves to the background (iOS may suspend or kill it without warning). Crash recovery copies stay as they are.

## Build order

| Phase | Work | Done when |
| --- | --- | --- |
| 1. Boots on iOS | `lib.rs` split, desktop-only cfg gates, `tauri ios init`, mobile capability, icons | Marklet opens in the iPad simulator with a sample file, editor and preview working; desktop builds unchanged (CI green) |
| 2. Files | Documents-folder workspace in Files, foreground refresh, trash replacement, "Open in Marklet" | Create, rename, delete and edit notes; edits made in the Files app appear on return |
| 3. iPad UI | Safe areas, toolbar actions replacing menus, settings sheet, keyboard handling, `isMobile` flag | Every desktop menu action is reachable by touch; hardware keyboard shortcuts work |
| 4. iPhone UI | Single-pane navigation, accessory bar, document switcher | Full edit → preview → export loop on an iPhone with no hardware keyboard |
| 5. Export & share | WKWebView PDF, HTML via share sheet, photo insert | PDF and HTML exports open correctly from Files |
| 6. Ship | TestFlight build to family testers, App Store listing, privacy label ("no data collected"), screenshots | Approved on the App Store |
| Later | iCloud Drive sync, external folders via bookmarks, iPad multi-window, Mac Catalyst not needed (desktop app exists) | — |

## CI

Add an `ios` job to `release.yml` on `macos-latest`: install the iOS targets, run `npm run tauri ios build -- --export-method app-store-connect`, and upload the `.ipa` to TestFlight. Needs secrets for the distribution certificate, provisioning profile and an App Store Connect API key. Until then, build and upload from the Mac with Xcode.

## Risks to check early

- **Plugin support on iOS:** confirm `plugin-dialog` (folder pick, save), `plugin-store` and `plugin-clipboard-manager` behave on a real device in phase 1, not at the end.
- **WKWebView performance:** Shiki, Mermaid and KaTeX are heavy; check typing latency on a mid-range iPhone with a long note, and lazy-load Mermaid/KaTeX if needed.
- **App Store review:** an app that is "just a web view" can be rejected; native file handling, the share sheet and Files integration make the case.
- **Memory:** iOS kills apps that use too much; cap open tabs on iPhone and drop preview DOM for background tabs.
