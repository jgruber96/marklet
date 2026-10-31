# Marklet — Build Brief

Oct 30, 2026 · @Jeff

## Overview

Build a desktop Markdown editor for Windows and macOS from one codebase: a split view with raw Markdown on the left and a live preview on the right, a folder-based file tree, tabs, a heading outline, language-aware syntax highlighting, and export to PDF and HTML.

- **Platforms:** Windows 10/11 (x64) and macOS 13+ on Apple Silicon only (no Intel Macs).
- **Goals:** starts fast, installs small (target under 15 MB), works on plain `.md` files on disk with no database or account.
- **Look:** clean and minimal, with light and dark themes that follow the OS by default.
- **App name:** Marklet, shown in the window title and package metadata.
- **Reference:** the approved mockup (light and dark artboards) defines the layout and colors in this brief.

## Tech stack

Tauri 2 wraps a TypeScript web front end in a native window and uses the OS web view, which keeps the app small; Rust handles file access, the folder watcher and export.

| Layer | Choice | Why |
| --- | --- | --- |
| App shell | Tauri 2 | One codebase for Windows and macOS, small installers, native menus and dialogs |
| Front end | TypeScript + Vite + React | Largest ecosystem and the most examples; CodeMirror and Shiki work with it directly |
| Editor | CodeMirror 6 | Markdown mode with nested language highlighting inside fenced code blocks |
| Markdown rendering | markdown-it (with anchor and task-list plugins) | Fast, CommonMark-compliant, easy to extend |
| Preview highlighting | Shiki | VS Code-quality highlighting; same themes as the editor |
| Sanitizing | DOMPurify | Rendered HTML is sanitized before it reaches the preview |
| File watching | `notify` crate (Rust) | Updates the tree and open tabs when files change on disk |
| Settings | `tauri-plugin-store` | Theme, recent folders, open tabs, window size |
| PDF export | Web view print to PDF | Uses the preview's print stylesheet; no bundled browser |

## V1 features

Each feature is done when its check passes on both Windows and macOS.

| Feature | Done when |
| --- | --- |
| Split view | Source and preview sit side by side; preview updates within 150 ms of typing; scroll stays in sync both ways |
| View modes | Toolbar switch toggles Editor, Split and Preview; the choice is remembered per window |
| Workspace folder | Open Folder shows every `.md` / `.markdown` file in a collapsible tree; new, rename and delete work from a right-click menu; external changes appear without a restart |
| Tabs | Multiple files open at once; an unsaved file shows a dot; closing an unsaved tab asks to save; tabs reopen on next launch |
| Outline | Sidebar lists the current file's headings, indented by level; clicking one scrolls both panes; the heading in view is highlighted |
| Formatting toolbar | Bold, italic, heading, link, inline code and bulleted list wrap the selection; standard shortcuts work (Ctrl/Cmd + B, I, K) |
| Syntax highlighting | Markdown tokens and fenced code blocks are colored in both panes (next section) |
| Export | Export menu saves the current file as PDF or a standalone HTML file with styles and highlighting inlined |
| Themes | Light and dark follow the OS; a menu item overrides it; the accent color is a setting |
| Saving | Ctrl/Cmd + S saves; autosave after 2 seconds idle (setting, on by default); files stay UTF-8 with their original line endings |
| Status bar | Shows line and column, word count, encoding and saved state |

## Syntax highlighting

Both panes are colored: the editor highlights Markdown itself and the code inside fenced blocks, and the preview highlights code blocks with matching colors.

**Editor (CodeMirror 6).** Headings, bold, italic, links, inline code and blockquotes get their own styles, and the syntax characters (`#`, `**`, `[]()`, backticks, fences) are dimmed. A fenced block's language tag (```` ```yaml ````) selects the language pack, and the block gets a tinted background.

**Preview (Shiki).** Code blocks show a language label and a Copy button. Untagged or unknown languages render as plain monospace, never as an error.

Must-support languages and the fence tags each accepts:

| Language | Fence tags |
| --- | --- |
| JavaScript | `js`, `javascript`, `jsx` |
| TypeScript | `ts`, `typescript`, `tsx` |
| Python | `py`, `python` |
| YAML | `yml`, `yaml` |
| JSON | `json`, `jsonc` |
| PowerShell | `ps1`, `powershell`, `pwsh` |
| Bash / shell | `sh`, `bash`, `shell`, `zsh` |
| HTML | `html`, `xml` |
| CSS | `css`, `scss` |
| SQL | `sql` |
| C# | `cs`, `csharp` |
| Rust | `rs`, `rust` |

Load language packs on demand so startup stays fast. Use one token palette for both panes (light: keyword `#cf222e`, string `#0a3069`, function `#8250df`, comment `#6e7781`, number `#0550ae`; dark: `#ff7b72`, `#a5d6ff`, `#d2a8ff`, `#8b949e`, `#79c0ff`).

## Layout and design tokens

The window stacks five bands top to bottom, matching the mockup:

1. **Title bar** — native on each OS; shows the file name and app name.
2. **Toolbar** — New, Open Folder, formatting buttons, the Editor/Split/Preview switch, and an Export button with a PDF/HTML menu.
3. **Tab strip** — one tab per open file, unsaved dot, close button, + for a new tab.
4. **Body** — sidebar (about 240 px, resizable) with Files above Outline; then the editor pane and the preview pane, split 50/50 with a draggable divider.
5. **Status bar** — language, encoding, line and column, word count, saved state.

Fonts: Inter for the interface, JetBrains Mono for the editor and code blocks (both bundled, OFL-licensed).

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#ffffff` | `#17191c` |
| Sidebar / bars | `#f6f7f9` | `#1f2226` |
| Border | `#e3e5e8` | `#2e3238` |
| Text | `#1f2328` | `#e6e8eb` |
| Muted text | `#57606a` | `#a0a7b1` |
| Accent (default) | `#2f6feb` | `#6ea2ff` |
| Selected row | `#e8eef9` | `#2a2f37` |
| Code block background | `#f6f8fa` | `#111316` |
| Current line | `#eef3fd` | `#232830` |

Define these as CSS custom properties in one theme file so the editor, preview and export all read from the same source.

## Project structure

One repo, front end in `src/` and the Rust side in `src-tauri/`, as Tauri's template lays it out.

```
markdown-editor/
├── src/                      # front end (React + TS)
│   ├── App.tsx               # window layout: toolbar, tabs, body, status bar
│   ├── lib/
│   │   ├── editor/           # CodeMirror setup, Markdown + language packs, keymaps
│   │   ├── preview/          # markdown-it pipeline, Shiki, DOMPurify, scroll sync
│   │   ├── sidebar/          # FileTree.tsx, Outline.tsx
│   │   ├── tabs/             # tab state, unsaved tracking, session restore
│   │   ├── export/           # HTML and PDF export
│   │   └── stores/           # workspace, settings, theme
│   └── styles/
│       ├── theme.css         # design tokens, light + dark
│       └── print.css         # PDF export styles
├── src-tauri/                # Rust side
│   ├── src/
│   │   ├── main.rs
│   │   ├── fs.rs             # read, write, rename, delete, list folder
│   │   └── watcher.rs        # notify-based folder watcher
│   ├── icons/
│   └── tauri.conf.json
├── package.json
└── README.md
```

## Build order

Build in six milestones, each ending with a working app that runs with `npm run tauri dev` and a commit.

1. **Shell and editor** — scaffold Tauri 2 + React, the five-band layout, theme tokens, and a CodeMirror pane that opens and saves a single file.
2. **Live preview** — markdown-it render beside the editor, view-mode switch, two-way scroll sync, DOMPurify.
3. **Highlighting** — Markdown token styles in the editor, language packs for fenced blocks, Shiki in the preview with label and Copy button; check every language in the table above, YAML included.
4. **Workspace and tabs** — Open Folder, file tree with right-click actions, folder watcher, tabs with unsaved state and session restore.
5. **Outline, toolbar and status bar** — heading outline with click-to-jump, formatting buttons and shortcuts, autosave, status bar.
6. **Export and polish** — HTML and PDF export, theme override and accent setting, keyboard pass, then a test run on both Windows and macOS.

## Packaging and scope

Ship a Windows installer and a macOS app from `npm run tauri build`, credited to DarkstarDEV.

- **Windows:** `.msi` and NSIS `.exe` installers; register `.md` and `.markdown` so files open in the app.
- **macOS:** Apple Silicon-only `.dmg` (build target aarch64-apple-darwin) with the same file associations. Each installer must be built on its own OS, or by a GitHub Actions matrix later.
- **Metadata:** product name "Marklet"; publisher and copyright line "DarkstarDEV"; bundle identifier `us.darkstardev.marklet`.
- **Signing:** unsigned for v1, so Windows SmartScreen and macOS Gatekeeper will warn on first launch.

Out of scope for v1: WYSIWYG editing, Mermaid and math rendering, image paste, Git integration, cloud sync, plugins, spell check, mobile builds, auto-update.

## Kickoff prompt for Claude Code

Export this doc as Markdown, save it as `BRIEF.md` in an empty project folder, open Claude Code there, and paste:

```
Read BRIEF.md. It is the full spec for a cross-platform Markdown editor built with Tauri 2, React + TypeScript, CodeMirror 6, markdown-it and Shiki.

Check that Node, Rust and the Tauri prerequisites for this OS are installed; install anything missing or tell me what to install.

Then build milestone 1 from the "Build order" section. When it runs with `npm run tauri dev`, commit it, tell me what to try, and wait for my go-ahead before starting milestone 2. Keep the layout and colors exactly as the "Layout and design tokens" section specifies.
```
