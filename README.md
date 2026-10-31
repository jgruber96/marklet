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
- [ ] 2. Live preview
- [ ] 3. Highlighting
- [ ] 4. Workspace and tabs
- [ ] 5. Outline, toolbar and status bar
- [ ] 6. Export and polish
