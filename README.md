# Marklet

A desktop Markdown editor for Windows and macOS (Apple Silicon), built with Tauri 2, React + TypeScript and CodeMirror 6. See [BRIEF.md](BRIEF.md) for the full spec and build order.

![Marklet in dark mode: file tree and outline on the left, Markdown source and live preview side by side](docs/screenshots/split-dark.png)

**[Download for Windows](https://github.com/jgruber96/marklet/releases/latest)** (installer under 5 MB). The macOS build is still to come.

## Features

- **Live preview** beside the editor, updated as you type, with scroll kept in sync both ways
- **Rich view**: edit with the Markdown symbols hidden (headings, bold, links, bullets, task boxes and images shown as they will read); the symbols come back where the cursor is, and the file stays plain Markdown
- **Folder workspace**: a tree of every Markdown file with new, rename and delete, which follows changes made outside the app
- **Tabs** with an unsaved dot, a save prompt on close, and session restore on the next launch
- **Outline** of the current file's headings; click one to jump both panes there
- **Syntax highlighting** for Markdown and for code in 12 languages, with the same colors in the editor and the preview
- **Math**: `$…$` inline and `$$…$$` blocks, rendered with KaTeX
- **Diagrams**: a `mermaid` code block renders as a diagram, redrawn as you type
- **Image paste**: paste a screenshot or a copied image into the editor; it is saved in an `assets` folder next to the file and linked
- **Spell check** in the editor with the system dictionaries, skipping code, links and HTML; turn it off in Settings
- **Auto-update**: checks for a new version at startup and installs it when you agree
- **Formatting** buttons and shortcuts, plus autosave after 2 seconds idle
- **Export** to a standalone HTML file or to PDF
- **Light and dark** themes that follow the OS, with an override and six accent colors

## Screenshots

| Light | Code and tables |
| --- | --- |
| ![Split view in the light theme](docs/screenshots/split-light.png) | ![Highlighted TypeScript, a table and a blockquote in the dark theme](docs/screenshots/code-dark.png) |

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

Each platform builds its own installers: on Windows, an `.msi` and an NSIS `.exe` under `src-tauri/target/release/bundle/`; on macOS, a `.dmg` for Apple Silicon:

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

Builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch. Both register `.md` and `.markdown` files to open in Marklet.

## Releasing an update

Installed copies check the newest GitHub release at startup (and from Settings › Check for Updates) and offer to install it. An update is only accepted if it was signed with the project's private update key, so a build needs that key:

1. Set the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Build with the key (PowerShell; the key file is kept outside the repo):

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\marklet.key"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   npm run tauri build
   ```

3. Write `installers/latest.json`: `node scripts/latest-json.mjs "What changed"`.
4. Create the GitHub release tagged `v<version>` and attach `Marklet_<version>_x64-setup.exe`, the `.msi`, and `latest.json`.

Back up the key file. If it is lost, installed copies can no longer be updated automatically and need a manual reinstall with a new key. Version 0.1.0 has no updater; it is replaced by installing 0.2.0 by hand. Auto-update is Windows-only until a macOS build is added to `latest.json`.

## Keyboard shortcuts

Ctrl on Windows, Cmd on macOS.

| Action | Shortcut |
| --- | --- |
| New / Open / Open Folder | Ctrl+N / Ctrl+O / Ctrl+Shift+O |
| Save / Save As | Ctrl+S / Ctrl+Shift+S |
| Close tab / next tab / previous tab | Ctrl+W / Ctrl+Tab / Ctrl+Shift+Tab |
| Export as HTML / PDF | Ctrl+Shift+E / Ctrl+P |
| Editor only / Split / Preview only / Rich | Ctrl+1 / Ctrl+2 / Ctrl+3 / Ctrl+4 |
| Bold / Italic / Link | Ctrl+B / Ctrl+I / Ctrl+K |
| Move focus out of the editor | Esc, then Tab |
| Back to the editor from the sidebar | Esc |
| File tree | Arrows to move and open or close folders, Enter to open, F2 to rename, Delete to delete |

## macOS test checklist

Not yet run on a Mac. On macOS 13+ (Apple Silicon), check:

- [ ] The app menu holds Settings (Theme, Accent Color, Autosave) and Quit; Cmd+C/V/X/Z work in the editor
- [ ] Open Folder, tree new/rename/delete (to the Trash), and outside edits appearing without a restart
- [ ] Closing an unsaved tab and quitting with Cmd+Q both ask to save
- [ ] Export as PDF opens the print dialog; its PDF button saves a light-themed copy of the preview
- [ ] Export as HTML opens in Safari looking like the preview
- [ ] Double-clicking a `.md` file in Finder opens it, both when Marklet is closed and when it is running

## Status

- [x] 1. Shell and editor: five-band layout, theme tokens, single-file open/save
- [x] 2. Live preview: markdown-it + DOMPurify, view modes, two-way scroll sync
- [x] 3. Highlighting: Markdown styles and fenced-code packs in the editor, Shiki in the preview
- [x] 4. Workspace and tabs: folder tree with new/rename/delete, folder watcher, multiple tabs, session and window-size restore
- [x] 5. Outline, toolbar and status bar: outline with jump and in-view highlight, formatting buttons and Ctrl/Cmd+B/I/K, autosave setting, status bar
- [x] 6. Export and polish: HTML and PDF export, theme and accent settings, View menu, keyboard pass, file associations (tested on Windows; macOS checklist above)
- [x] 7. Math and diagrams: KaTeX and Mermaid in the preview and in HTML and PDF export, loaded on first use
- [x] 8. Image paste: pasted images saved beside the document in `assets/` and linked with a relative path
- [x] 9. Spell check: the web view's checker on prose only, with a Settings toggle
- [x] 10. Auto-update: signed updates from GitHub Releases, checked at startup and from the Settings menu
- [x] 11. Rich view: a fourth view mode that hides Markdown symbols away from the cursor and draws images, bullets and task boxes in place; tables, math, diagrams and HTML stay as source there

## License

[MIT](LICENSE) © DarkstarDEV. The bundled Inter and JetBrains Mono fonts are under the SIL Open Font License.
