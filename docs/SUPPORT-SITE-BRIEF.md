# Marklet Support Site — Brief

Nov 13, 2026 · DarkstarDEV · based on Marklet 0.7.0 (`jgruber96/marklet`)

Everything needed to build a support and marketing site for Marklet that matches the app: brand, colors, gradients, fonts, shapes, assets, product facts, and what the App Store asks a support site to provide. Values are copied from the app's source (`src/styles/theme.css`, `app.css`, `preview.css`, `docs/icon/marklet.svg`), so the site and the app stay one design.

## 1. Product at a glance

| | |
| --- | --- |
| **Name** | Marklet |
| **Publisher / copyright** | DarkstarDEV |
| **One line** | A quiet place to write Markdown. |
| **Short description** | A desktop Markdown editor with a live preview, a rich writing view, and notes kept as plain files on your own computer. |
| **Category** | Productivity |
| **Price / account** | Free. No account, no sign-in, no subscription. |
| **Current version** | 0.7.0 (Nov 13, 2026). 1.0 is planned once 0.7.0 has been in daily use for a while. |
| **Platforms** | Windows 10/11 (x64) and macOS 13 Ventura or later on Apple Silicon, released. **iPhone and iPad (iOS / iPadOS 17+, one universal app) are in development for the App Store** (`docs/IOS-BRIEF.md`). |
| **License** | MIT. Bundled Inter and JetBrains Mono fonts are under the SIL Open Font License. |
| **Source and downloads** | https://github.com/jgruber96/marklet · releases: https://github.com/jgruber96/marklet/releases/latest |

### Elevator pitch (for the hero section)

> Marklet is a quiet place to write Markdown. Your notes are plain text files on your own computer, so they open in any other app and stay yours. Write with the symbols showing, or switch to Rich view and write on the finished page. Tables, math, diagrams and code all render as you type.

### Feature list (site copy, in order of appeal)

1. **Three ways to write.** Split view with a live preview, Rich view that hides the Markdown symbols, and Focus mode that clears everything but your words.
2. **Command palette.** Jump to any note by a few letters of its name (Ctrl/Cmd+T), or find any command (Ctrl/Cmd+Shift+P).
3. **Rich content.** Tables you edit cell by cell, math (KaTeX), Mermaid diagrams, and highlighted code in 12 languages.
4. **Your files, your folder.** Open a folder of notes, browse it in a file tree, search across every note, and keep everything as `.md` files.
5. **Paste and drop images.** Screenshots and images are saved in an `assets` folder next to the note and linked for you.
6. **Smart typing.** Lists continue on Enter, brackets pair up, and pasting a web address over a word makes a link.
7. **Nothing is lost.** Autosave two seconds after you stop typing, and unsaved work is offered back after a crash.
8. **Make it yours.** Light and dark themes, six accent colors, fonts, text size and line width.
9. **Export** to a standalone HTML page or a PDF.
10. **Updates itself**, signed so only genuine updates install.

## 2. Logo and icon

The icon is a white rounded **M** on a diagonal three-color gradient tile with a soft shine.

| Asset | Path in the repo | Use |
| --- | --- | --- |
| Vector source | `docs/icon/marklet.svg` | Site header, favicon (SVG), any size |
| 1024 × 1024 PNG | `docs/icon/marklet-1024.png` | App Store, social cards, Apple touch icon (scale down) |
| Generated set | `src-tauri/icons/` (`icon.ico`, `icon.icns`, 32–512 px PNGs) | Favicons at fixed sizes |

Icon construction (512 × 512 canvas):

| Part | Value |
| --- | --- |
| Tile | Square, corner radius 116 (22.7 % of the side) |
| Tile gradient | Diagonal, top-left to bottom-right: `#ff3d8f` → `#8b4dff` (50 %) → `#22b8f0` |
| Shine | Radial, centered at 25 % / 15 %, white 35 % opacity fading to 0 at 60 % |
| Letter | Stroked path `M140 368V160l116 140 116-140v208`, stroke width 56, round caps and joins |
| Letter fill | Vertical gradient `#ffffff` → `#e6dcff` |
| Letter shadow | Drop shadow 0 / 14 px, blur 14, `#2a0f5c` at 45 % |

Do: show the icon on dark or light backgrounds; keep clear space of at least 1/8 of its width. Don't: recolor it, stretch it, or put it on a busy photo.

**Wordmark:** "Marklet" set in Inter SemiBold (600), in `--text`, next to the icon. On hero sections the wordmark can take the title gradient (§4).

## 3. Color

The look is called **Aurora**: indigo-tinted surfaces, one accent color for controls, and a three-color glow kept for the few things that should shine. Marklet follows the system light or dark setting; the site should too (`prefers-color-scheme`).

### Surfaces and text

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#fdfcff` | `#1c1b29` | Page and editor background |
| `--bar` | `#f1eefb` | `#232233` | Chrome: toolbar, sidebar, cards, menus |
| `--border` | `#e0d9f3` | `#34324a` | Hairlines, card outlines |
| `--text` | `#221f33` | `#ecebf7` | Body text |
| `--muted` | `#6b6685` | `#9a97b8` | Secondary text, captions |
| `--selected` | `#e4dcfa` | `#34314f` | Selected rows, active tab |
| `--code-bg` | `#f5f2fd` | `#161522` | Code blocks, inputs |
| `--current-line` | `#f3eefe` | `#252438` | Subtle highlight bands |

### Accent and glow (default preset, "Aurora")

| Token | Value | Used for |
| --- | --- | --- |
| `--accent` (light theme) | `#8b3dff` | Links in UI, focus rings, checkboxes, section labels |
| `--accent` (dark theme) | `#c792ff` | Same, on dark |
| `--glow-1` | `#ff5fa2` | Glow, left stop (pink) |
| `--glow-2` | `#a66bff` | Glow, middle stop (violet) |
| `--glow-3` | `#4cc9f0` | Glow, right stop (cyan) |
| `--on-glow` | `#16141f` | Text placed on the glow (dark, in every preset) |

### Pop colors (Markdown structure and icons)

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--h1` | `#d6247a` | `#ff7ab6` | Heading level 1 in the editor |
| `--h2` | `#7048e8` | `#b79cff` | Heading level 2 |
| `--h3` | `#0b84a8` | `#5fd4f4` | Heading level 3 |
| `--link` | `#0b7fb0` | `#5fd4f4` | Links in documents |
| `--code-text` | `#c2255c` | `#ff9ac6` | Inline code |
| `--marker` | `#7048e8` | `#b79cff` | List markers, bullets |
| `--pop-pink` | `#d6247a` | `#ff7ab6` | "New", unsaved dot |
| `--pop-cyan` | `#0b84a8` | `#5fd4f4` | "Open" |
| `--pop-amber` | `#c26a00` | `#ffb86b` | Folders, "Open Folder" |
| `--ok` | `#12915d` | `#6ee7b7` | "Saved" dot, success |

### Code highlighting

| Token | Light | Dark |
| --- | --- | --- |
| Keyword | `#d6336c` | `#ff7ab6` |
| String | `#0b7285` | `#7ee0d2` |
| Function / type | `#7048e8` | `#b79cff` |
| Number / constant | `#d9480f` | `#ffb86b` |
| Comment | `#6f6a8c` | `#8683a3` |

### Accent presets

Users can pick one of six presets; each changes the accent and the three glow stops. The site should use **Aurora**, and can show the others as swatches.

| Preset | Accent light | Accent dark | Glow 1 | Glow 2 | Glow 3 |
| --- | --- | --- | --- | --- | --- |
| **Aurora** (default) | `#8b3dff` | `#c792ff` | `#ff5fa2` | `#a66bff` | `#4cc9f0` |
| Purple | `#6d4aff` | `#a99bff` | `#8f84ff` | `#a66bff` | `#e58bff` |
| Green | `#12855a` | `#4ade80` | `#a3e635` | `#22c55e` | `#22d3ee` |
| Orange | `#c2500a` | `#ff9f43` | `#ff5f6d` | `#ff9f43` | `#ffd166` |
| Pink | `#d6247a` | `#ff7ab6` | `#ff4d8d` | `#ff7ab6` | `#ffa94d` |
| Teal | `#0b7fb0` | `#4cc9f0` | `#2dd4bf` | `#38bdf8` | `#8b7bff` |

### Contrast

Body text on `--bg` passes WCAG AA in both themes, and the app passed an axe audit in every theme and preset (0.6.0). Keep the site to the same rules: body copy in `--text`, never in a glow color; glow and pop colors for headings, accents, icons and lines; text on the glow in `--on-glow`.

## 4. Gradients

```css
/* The glow: active buttons, underlines, the top hairline, dividers */
--glow: linear-gradient(90deg, #ff5fa2, #a66bff 55%, #4cc9f0);

/* Document titles as gradient text. Dark theme: the glow itself.
   Light theme: the same stops mixed 55/45 with #1a0f3a so they stay readable on white. */
--glow-text-light: linear-gradient(90deg, #983b73, #6742a6 55%, #36759e);
--glow-text-dark: var(--glow);

/* The icon tile (deeper, diagonal) */
--icon-gradient: linear-gradient(135deg, #ff3d8f, #8b4dff 50%, #22b8f0);
```

Gradient text, as the app does it:

```css
.title {
  background: var(--glow-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

**The wash** behind the app's window chrome is three soft radial glows over `--bar`, at 13 % strength in light and 20 % in dark. It is the right background for a site header or hero band:

```css
.hero {
  background:
    radial-gradient(60% 340px at 0% 0%, color-mix(in srgb, #ff5fa2 13%, transparent), transparent 70%),
    radial-gradient(55% 320px at 100% 0%, color-mix(in srgb, #4cc9f0 13%, transparent), transparent 70%),
    radial-gradient(420px 60% at 0% 100%, color-mix(in srgb, #a66bff 13%, transparent), transparent 70%),
    var(--bar);
}
```

Where the glow appears in the app (and should on the site, sparingly):

- A 2 px hairline along the very top of the window
- The active view button (a pill filled with the glow, dark text, a soft violet shadow `0 2px 10px -2px` of `--glow-2` at 70 %)
- A 2 px rounded underline under the active tab, and a 3 px × 2.2 em underline under level-2 headings
- Document titles as gradient text
- Horizontal rules, quote bars and the top edge of dialogs (3 px)
- Highlighted menu items: a wash of the three stops at 22–26 % with a 3 px glowing left edge

## 5. Typography

| Role | Font | Weights | Fallback stack |
| --- | --- | --- | --- |
| Interface and reading | **Inter** | 400, 500, 600 (700 for document titles) | `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif` |
| Code and the Markdown editor | **JetBrains Mono** | 400, 700 | `"JetBrains Mono", ui-monospace, "Cascadia Mono", Menlo, monospace` |

Both are free (SIL OFL) and on Google Fonts:
`https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap`

Type scale from the app's reading view (good defaults for site content):

| Element | Size | Weight | Line height | Notes |
| --- | --- | --- | --- | --- |
| Body | 15 px (site: 16–17 px) | 400 | 1.65 | Max line width 820 px |
| H1 | 2 em | 700 | 1.25 | Gradient text |
| H2 | 1.5 em | 600 | 1.25 | `--h2` color, glow underline |
| H3 | 1.25 em | 600 | 1.25 | `--h3` color |
| UI text | 13 px | 400–600 | 1.4 | Buttons, menus, sidebar |
| Section labels | 10.5–11 px | 600 | | UPPERCASE, letter-spacing 0.06–0.09 em, `--muted` or `--accent` |
| Code | 0.86 em | 400 | 1.5 | JetBrains Mono, on `--code-bg` |

## 6. Shape, depth and motion

| Element | Radius | Other |
| --- | --- | --- |
| Buttons, tabs, inputs, list rows | 7–8 px | Hover: `--selected` at 55–80 % |
| Segmented control (view switcher) | 9 px outer, 7 px inner | Inset 1 px `--border` ring |
| Menus | 11 px | `0 14px 36px -8px rgb(0 0 0 / 50%)` plus a 1 px `--border` ring |
| Dialogs, command palette, cards | 14 px | `0 24px 60px -12px rgb(0 0 0 / 55%)` plus a 1 px `--border` ring; 3 px glow along the top edge |
| Pills (hints, badges) | 999 px | |
| Status dots | Circle, 7–8 px | Glow: `0 0 6px` of their own color at 70 % |
| Editor sheet | 12 px top-left corner | Sits inside the chrome with a 1 px `--border` ring |

Motion is quick and quiet: 0.09–0.15 s fades and 3 px slides. Everything stops under `prefers-reduced-motion: reduce`. Keyboard focus is a 2 px `--accent` outline, never removed.

## 7. Ready-to-use CSS variables

```css
:root {
  color-scheme: light dark;
  --bg: #fdfcff; --bar: #f1eefb; --border: #e0d9f3; --text: #221f33; --muted: #6b6685;
  --accent: #8b3dff; --selected: #e4dcfa; --code-bg: #f5f2fd;
  --glow-1: #ff5fa2; --glow-2: #a66bff; --glow-3: #4cc9f0;
  --glow: linear-gradient(90deg, var(--glow-1), var(--glow-2) 55%, var(--glow-3));
  --glow-text: linear-gradient(90deg, #983b73, #6742a6 55%, #36759e);
  --on-glow: #16141f;
  --h2: #7048e8; --h3: #0b84a8; --link: #0b7fb0; --pop-amber: #c26a00; --ok: #12915d;
  --wash: 13%;
  --font-ui: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Menlo, monospace;
  --radius: 8px; --radius-card: 14px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1b29; --bar: #232233; --border: #34324a; --text: #ecebf7; --muted: #9a97b8;
    --accent: #c792ff; --selected: #34314f; --code-bg: #161522;
    --glow-text: var(--glow);
    --h2: #b79cff; --h3: #5fd4f4; --link: #5fd4f4; --pop-amber: #ffb86b; --ok: #6ee7b7;
    --wash: 20%;
  }
}
```

## 8. Screenshots and imagery

Current screenshots (1280 × 800, taken from the running app) are in `docs/screenshots/`:

| File | Shows |
| --- | --- |
| `split-dark.png` | Split view, dark theme: file tree, outline, Markdown source and live preview |
| `split-light.png` | The same in the light theme |
| `rich-dark.png` | Rich view: symbols hidden, task boxes and code drawn in place |
| `menu-dark.png` | The app menu open on View |

Mobile screenshots should come from the iOS app itself (on iOS there is no glow hairline along the top of the screen). Good additional desktop shots for the site: the welcome note in Rich view, the command palette, Focus mode, a table being edited, a Mermaid diagram, and the Settings window with the six accent swatches. These are Windows captures; the App Store needs Mac captures of the Mac build (§11).

## 9. Build and technical facts

| | |
| --- | --- |
| Framework | Tauri 2 (Rust back end, the system web view: WebView2 on Windows, WKWebView on macOS) |
| Front end | React 19, TypeScript, Vite |
| Editor | CodeMirror 6 |
| Rendering | markdown-it, Shiki (code), KaTeX (math), Mermaid (diagrams), DOMPurify (sanitizing) |
| Bundle identifier | `us.darkstardev.marklet` |
| Minimum OS | Windows 10 (x64, WebView2 runtime, built into Windows 11); macOS 13 Ventura on Apple Silicon (no Intel build); iOS and iPadOS 17 (iPhone and iPad, one universal app) |
| Download sizes (0.7.0) | Windows installer (`.exe`) 7.5 MB, `.msi` 9.2 MB; Mac `.dmg` 10.6 MB |
| Mac signing | Developer ID Application certificate, notarized and stapled by Apple; opens without a warning |
| Windows signing | Not code-signed: SmartScreen asks once on first install ("More info" › "Run anyway") |
| Updates | Built in. Checks GitHub Releases at startup; every update is signed with the project's update key and verified before installing |
| Release pipeline | GitHub Actions builds both platforms from a version tag, runs unit tests and a smoke test of the running app, then signs, notarizes and publishes |
| File formats | Opens and saves `.md` and `.markdown` (UTF-8, keeps line endings and BOM); exports `.html` and `.pdf` |
| iPhone and iPad (in development) | Notes live in Marklet's own folder, visible in the Files app (On My iPhone / iPad › Marklet); a `.md` file can be opened from Files with "Open in Marklet". Layouts for iPad, and for iPhone in phone, medium and wide sizes. Updates come from the App Store (no built-in updater). Export as PDF is not available on iOS yet |
| Where things are stored | Notes: wherever the user keeps them. Settings, recent files and crash-recovery copies: the app's data folder (`%APPDATA%\us.darkstardev.marklet` on Windows, `~/Library/Application Support/us.darkstardev.marklet` on Mac) |

### Keyboard shortcuts (Ctrl on Windows, Cmd on Mac)

| Action | Shortcut |
| --- | --- |
| Go to note / Command palette | Ctrl+T / Ctrl+Shift+P |
| New / Open / Open Folder | Ctrl+N / Ctrl+O / Ctrl+Shift+O |
| Save / Save As | Ctrl+S / Ctrl+Shift+S |
| Editor / Split / Preview / Rich | Ctrl+1 / Ctrl+2 / Ctrl+3 / Ctrl+4 |
| Focus mode | F11 (Cmd+Shift+Enter on Mac) |
| Find / Find in folder | Ctrl+F / Ctrl+Shift+F |
| Bold / Italic / Link | Ctrl+B / Ctrl+I / Ctrl+K |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Settings | Ctrl+, |
| Export HTML / PDF | Ctrl+Shift+E / Ctrl+P |
| Menu (Windows) | F10 |

## 10. Privacy (the site's privacy policy can be built from this)

Marklet collects no data. There is no account, analytics, telemetry, advertising or tracking. It contacts the internet in two cases only:

1. **Update checks** (Windows and direct Mac builds only; the App Store versions are updated by the App Store): at startup, and from Check for Updates, it asks GitHub for the latest release and downloads the update if the user chooses to install it. GitHub sees the request's IP address, as for any download. Nothing about the user or their notes is sent.
2. **Content a note points to**: an image in a note that has a web address is loaded from that address, and links open in the browser.

Notes stay on the user's computer. Settings, the recent-files list and crash-recovery copies are stored locally only. For the App Store's privacy section this is **"Data Not Collected"**.

## 11. App Store requirements for the site

App Store Connect asks for these URLs on every app listing:

| Field | Required | What the page needs |
| --- | --- | --- |
| **Support URL** | Yes | A page with a way to contact you (an email address or a form), plus help content |
| **Privacy Policy URL** | Yes | A privacy policy (§10 covers what it must say) |
| **Marketing URL** | No | The home page of the site |

Suggested pages:

1. **Home**: hero with the icon, the one-liner, a screenshot and download buttons (Mac App Store badge, Windows download from GitHub).
2. **Features**: the list in §1 with screenshots.
3. **Support / Help**: getting started, the shortcut table, FAQ, and a contact address. Useful FAQ entries: where my notes are stored; how crash recovery works; how to open a folder; how updates work; "Windows protected your PC" on install; how to report a bug (GitHub Issues).
4. **Privacy policy**: §10, dated, naming DarkstarDEV.
5. **Release notes**: from `CHANGELOG.md`.

The contact address and a legal contact name are yours to decide; this brief deliberately does not include one.

**Screenshots for the listing:** iPhone and iPad screenshots taken from the iOS app, at the device sizes App Store Connect asks for when you upload (it lists the accepted pixel sizes per display). For a Mac App Store listing, 16:10 Mac screenshots at 1280 × 800, 1440 × 900, 2560 × 1600 or 2880 × 1800. The 1024 × 1024 icon (`docs/icon/marklet-1024.png`) matches the app icon in the iOS project.

### Note: App Store builds differ from today's direct downloads

The iPhone and iPad app is the natural App Store listing, and is being built for it (`docs/IOS-BRIEF.md`). Today's Mac app is distributed directly (signed with Developer ID and notarized, from GitHub). An App Store version is a separate build target:

- **Different certificate and a provisioning profile:** "Apple Distribution" (Mac App Store) or the iOS equivalent, instead of Developer ID.
- **App Sandbox is required on the Mac App Store.** Opening any folder, watching it for changes and saving images next to a note need sandbox entitlements and security-scoped bookmarks.
- **No built-in updater:** the App Store handles updates, so the GitHub updater must be turned off in that build.
- **iPhone and iPad** follow `docs/IOS-BRIEF.md`: no updater, notes in the app's Files folder, and PDF export still to come.

None of this affects the support site, but it decides what the site says about downloading: an App Store badge for the store build, and GitHub for the direct Windows and Mac builds.
