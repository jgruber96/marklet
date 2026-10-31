# Nova MD

A desktop Markdown editor for Windows and macOS (Apple Silicon), built with Tauri 2, React + TypeScript and CodeMirror 6. See [BRIEF.md](BRIEF.md) for the full spec and build order.

## Prerequisites

- Node.js 20+ and npm
- Rust (stable, via rustup)
- Windows: Visual Studio 2022 Build Tools with the "Desktop development with C++" workload, and the WebView2 runtime (preinstalled on Windows 11)
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Run

```bash
npm install
npm run tauri dev
```

## Build installers

```bash
npm run tauri build
```

## Status

- [x] 1. Shell and editor: five-band layout, theme tokens, single-file open/save
- [x] 2. Live preview: markdown-it + DOMPurify, view modes, two-way scroll sync
- [x] 3. Highlighting: Markdown styles and fenced-code packs in the editor, Shiki in the preview
- [x] 4. Workspace and tabs: folder tree with new/rename/delete, folder watcher, multiple tabs, session and window-size restore
- [x] 5. Outline, toolbar and status bar: outline with jump and in-view highlight, formatting buttons and Ctrl/Cmd+B/I/K, autosave setting, status bar
- [ ] 6. Export and polish
