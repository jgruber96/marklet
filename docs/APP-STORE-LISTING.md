# Marklet — App Store Listing

Nov 13, 2026 · DarkstarDEV · for the iPhone and iPad app (`us.darkstardev.marklet`), version 0.7.0

Everything App Store Connect asks for, ready to paste. Character limits are App Store Connect's; every field here is within them. Product facts match `docs/SUPPORT-SITE-BRIEF.md`; how to build and upload is in the README ("Releasing to TestFlight").

## App information

| Field | Value |
| --- | --- |
| **Name** (30) | Marklet |
| If the name is taken | Marklet – Markdown Notes |
| **Subtitle** (30) | Markdown notes, plain files |
| **Bundle ID** | us.darkstardev.marklet |
| **SKU** | marklet-ios |
| **Primary language** | English (U.S.) |
| **Primary category** | Productivity |
| **Secondary category** | Utilities |
| **Copyright** | 2026 DarkstarDEV |
| **Price** | Free |
| **Support URL** | The Marklet support page, once the support site is up (`docs/SUPPORT-SITE-BRIEF.md`) |
| **Privacy Policy URL** | The Marklet privacy page on the same site |
| **Marketing URL** (optional) | The support site's home page |
| **Contact email for review** | support@darkstardev.us |

## Promotional text (170)

Can be changed at any time without a new build.

> Write Markdown on iPhone and iPad, with a live preview and a Rich view that hides the symbols. Notes stay plain .md files in the Files app.

## Description (4,000)

> Marklet is a quiet place to write Markdown. Your notes are plain .md files in Marklet's folder in the Files app, so they open in any other app and stay yours.
>
> THREE WAYS TO WRITE
> • Edit with the Markdown symbols showing.
> • Preview the finished page.
> • Rich view hides the symbols and lets you write on the finished page.
> On iPad, and on an unfolded iPhone Duo, Split view puts your Markdown and the finished page side by side.
>
> MADE FOR TOUCH
> • A formatting bar above the keyboard: bold, italic, headings, links, code, lists, undo and redo.
> • Press and hold a note to rename or delete it.
> • The layout follows your screen: iPhone, iPhone Duo folded or unfolded, iPad in either orientation, and Split View.
> • On iPad, keyboard shortcuts work with a hardware keyboard, and buttons show their labels when you point at them with a trackpad or mouse.
>
> RICH CONTENT
> • Tables you edit cell by cell.
> • Math, written in LaTeX.
> • Mermaid diagrams, redrawn as you type.
> • Highlighted code in 12 languages.
>
> YOUR FILES, YOUR FOLDER
> • Notes live in Files › On My iPhone (or iPad) › Marklet. Add, move and organize them there.
> • Changes made in the Files app appear when you come back to Marklet.
> • Open a Markdown file from the Files app with Share › Marklet.
> • Search across all your notes, jump to any note by name, and follow a note's outline.
>
> NOTHING IS LOST
> • Autosave a moment after you stop typing, and straight away when you switch apps.
> • If Marklet is closed unexpectedly, your unsaved work is offered back.
>
> SHARE AND EXPORT
> • Export a note as a PDF from the print sheet, or as a standalone web page.
> • Share the note itself with AirDrop, Mail, Messages or Save to Files.
>
> MAKE IT YOURS
> • Light and dark themes, six accent colors, editor and reading fonts, text size and line width.
>
> PRIVATE BY DESIGN
> No account, no sign-in, no subscription, no ads and no tracking. Marklet collects no data.
>
> Marklet is also available for Windows and Mac.

## Keywords (100)

Comma-separated, no spaces after commas; the name and category are already searched, so they are left out.

> markdown,notes,editor,md,writing,text,preview,latex,math,mermaid,diagram,journal,plain text,files

## What's New

Not shown for the first version. For later versions, the tag message of the matching desktop release (`CHANGELOG.md`) is a good start.

## App Privacy

Answer **"No, we do not collect data from this app"**. The App Privacy section then shows **Data Not Collected**.

Why this is accurate (from `docs/SUPPORT-SITE-BRIEF.md` §10): no account, analytics, telemetry, advertising or tracking. Notes, settings, the recent-files list and crash-recovery copies stay on the device. The iOS app has no updater and makes no connections of its own; the only network use is an image in a note that points to a web address, which is loaded from that address, and links, which open in the browser.

The build's privacy manifest (`src-tauri/gen/apple/marklet_iOS/PrivacyInfo.xcprivacy`) says the same: no tracking, no collected data types.

## Age rating

Answer **None** or **No** to every content question, and **No** to "Unrestricted Web Access" (Marklet does not browse the web; links open in Safari). The result is **4+**.

## App Review notes

> No account or sign-in is needed. On first launch Marklet opens a Welcome note that tours the features. Notes are saved in the app's own folder, which appears in the Files app under On My iPhone (or iPad) › Marklet. To see sharing, open the ☰ menu › File › Share…, Export as PDF… or Export as HTML….

## Screenshots

App Store Connect lists the accepted pixel sizes when you upload; screenshots from the largest iPhone and iPad simulators are accepted for the smaller sizes too. In the Simulator, **File › Save Screen** (⌘S) saves a full-resolution PNG to the desktop. Use a mix of dark and light themes, and real-looking notes rather than placeholder text.

| # | iPhone (6.9" display) | iPad (13" display) |
| --- | --- | --- |
| 1 | Welcome note in Preview | Split view: Markdown and the finished page side by side |
| 2 | Rich view with a table and a task list | Rich view, full width, with headings and a table |
| 3 | Editing with the keyboard up and the formatting bar above it | Sidebar open: file list and outline |
| 4 | Preview with math and a Mermaid diagram | Preview with math, a Mermaid diagram and highlighted code |
| 5 | Share sheet open from File › Share… | Light theme with a different accent color |

Optional captions over the screenshots, in the app's gradient (colors in `docs/SUPPORT-SITE-BRIEF.md`): "Write on the finished page", "Your notes are plain files", "Tables, math and diagrams", "Made for iPhone, iPad and iPhone Duo", "Share as PDF or a web page".

## Before submitting for review

- Support and privacy pages live, with the URLs above filled in.
- A build uploaded and tested in TestFlight (README, "Releasing to TestFlight").
- Screenshots for iPhone and iPad uploaded.
- Version number decided: 0.7.0 as it stands, or 1.0 for the App Store debut (set in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, as for a desktop release).
