# Changelog

What changed in each version of Marklet. Installed copies from 0.2.0 on update themselves.

## 0.7.0 (2026-11-13)

- **Command palette:** Ctrl+T jumps to any note by a few letters of its name; Ctrl+Shift+P (or `>` in the box) finds any command.
- **Focus mode** (F11, or Cmd+Shift+Enter on a Mac): full screen with only the text; everything but the paragraph being written is dimmed, and the cursor line stays in the middle.
- **Smart editing:** brackets, quotes and backticks close themselves; typing `*`, `_` or `~` over a selection wraps it; pasting a web address over a selection makes a link.
- **Welcome note:** a short tour opens on the first launch, and is always under Settings › Welcome Note.

## 0.6.0 (2026-11-13)

- **Accessibility:** the editor, tabs, outline, file tree and task boxes are named for screen readers; tabs work from the keyboard (Left / Right, Enter, Delete); text on the glow and the document title in the light theme are easier to read; animations stop when the system asks for reduced motion; current items are outlined in Windows high-contrast themes.
- **Safety net:** a smoke test drives the real app through its main features before a release can be published.
- Fixed: if the diagram library failed to start, the app retried in an endless loop.

## 0.5.0 (2026-11-12)

- **Marklet for Mac:** runs on macOS 13 or later on Apple Silicon, signed and notarized by Apple. It uses the system title bar and menu bar, and Cmd in place of Ctrl.
- Macs update themselves, like Windows.

## 0.4.3 (2026-11-11)

- The app menu, the Export dropdown and the file tree's right-click menu are drawn in the Aurora look, following the theme and accent.
- Open Recent shows each file's name with its folder.

## 0.4.2 (2026-11-11)

- **Custom title bar on Windows:** the toolbar is the top of the window, with the icon, a menu button (F10), the file name and the window buttons.

## 0.4.1 (2026-11-11)

- A new app icon: a white M on the Aurora gradient.

## 0.4.0 (2026-11-10)

- **Crash recovery:** unsaved work, including notes never saved, is offered back after the app or PC goes down.
- **Settings window** (Ctrl+,): theme, accent, editor and reading fonts, text size, line width, autosave and spell check.
- **Rich view:** tables are edited in place, cell by cell; tables, diagrams and formulas inside lists and quotes are drawn.
- **Search in folder** (Ctrl+Shift+F), **Open Recent**, **drag and drop** (notes, folders, images) and **zoom** (Ctrl+= / Ctrl+- / Ctrl+0).
- Releases are built, tested, signed and published by GitHub from a version tag.

## 0.3.0 (2026-11-10)

- **A new look, Aurora:** indigo-tinted light and dark themes, a three-color glow on the active view, tab and document title, and more color for headings, links, code and icons.
- Accent presets change the glow as well; the default is Aurora.

## 0.2.1 (2026-11-10)

- Rich view draws tables, math and diagrams in place; Ctrl+click follows a link.
- Fixed: a `$` next to inline code was taken for math.

## 0.2.0 (2026-11-10)

- **Rich view** (Ctrl+4): edit with the Markdown symbols hidden.
- **Math** (`$…$`, `$$…$$`) and **Mermaid diagrams** in the preview and in exports.
- **Image paste:** a pasted screenshot is saved in an `assets` folder next to the note and linked.
- **Spell check**, **find and replace** (Ctrl+F) and **automatic updates**.

## 0.1.0 (2026-10-31)

- The first version: live preview with scroll sync, a folder workspace with a file tree, tabs with session restore, an outline, syntax highlighting, formatting buttons, autosave, HTML and PDF export, and light and dark themes.
