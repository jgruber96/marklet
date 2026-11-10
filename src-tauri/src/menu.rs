//! Native menu bar. Items are forwarded to the front end as a `menu` event
//! carrying the item id; the front end owns documents, dialogs and settings.

use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, Menu, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

const THEMES: [(&str, &str); 3] = [("system", "System"), ("light", "Light"), ("dark", "Dark")];
const ACCENTS: [(&str, &str); 6] = [
    ("blue", "Aurora"),
    ("purple", "Purple"),
    ("green", "Green"),
    ("orange", "Orange"),
    ("pink", "Pink"),
    ("teal", "Teal"),
];
const VIEWS: [(&str, &str, &str); 4] = [
    ("editor", "Editor Only", "CmdOrCtrl+1"),
    ("split", "Split", "CmdOrCtrl+2"),
    ("preview", "Preview Only", "CmdOrCtrl+3"),
    ("rich", "Rich", "CmdOrCtrl+4"),
];

/// Groups whose check items behave like radio buttons: `group:value` ids.
const RADIO_GROUPS: [&str; 3] = ["theme", "accent", "view"];

/// Check items by id (`theme:dark`, `accent:blue`, `view:split`, `autosave`),
/// so their ticks can follow the front end's settings.
pub struct CheckItems(Vec<(String, CheckMenuItem<Wry>)>);

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, label);
        match accel {
            Some(a) => b.accelerator(a).build(app),
            None => b.build(app),
        }
    };
    let mut checks = Vec::new();
    let mut radio = |group: &str, value: &str, label: &str, accel: Option<&str>, on: bool| {
        let id = format!("{group}:{value}");
        let mut b = CheckMenuItemBuilder::with_id(&id, label).checked(on);
        if let Some(a) = accel {
            b = b.accelerator(a);
        }
        let check = b.build(app)?;
        checks.push((id, check.clone()));
        Ok::<_, tauri::Error>(check)
    };

    let quit_label = if cfg!(target_os = "macos") { "Quit Marklet" } else { "Exit" };
    let quit_accel = if cfg!(target_os = "macos") { Some("CmdOrCtrl+Q") } else { None };

    let mut file = SubmenuBuilder::new(app, "File")
        .item(&item("new", "New", Some("CmdOrCtrl+N"))?)
        .item(&item("open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&item("open-folder", "Open Folder…", Some("CmdOrCtrl+Shift+O"))?)
        .item(&item("close-folder", "Close Folder", None)?)
        .separator()
        .item(&item("save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item("save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&item("export-html", "Export as HTML…", Some("CmdOrCtrl+Shift+E"))?)
        .item(&item("export-pdf", "Export as PDF…", Some("CmdOrCtrl+P"))?)
        .separator()
        .item(&item("close-tab", "Close Tab", Some("CmdOrCtrl+W"))?);
    if !cfg!(target_os = "macos") {
        file = file.separator().item(&item("quit", quit_label, quit_accel)?);
    }
    let file = file.build()?;

    let mut view = SubmenuBuilder::new(app, "View");
    for (value, label, accel) in VIEWS {
        view = view.item(&radio("view", value, label, Some(accel), value == "split")?);
    }
    let view = view.build()?;

    let mut theme = SubmenuBuilder::new(app, "Theme");
    for (value, label) in THEMES {
        theme = theme.item(&radio("theme", value, label, None, value == "system")?);
    }
    let theme = theme.build()?;

    let mut accent = SubmenuBuilder::new(app, "Accent Color");
    for (value, label) in ACCENTS {
        accent = accent.item(&radio("accent", value, label, None, value == "blue")?);
    }
    let accent = accent.build()?;

    let autosave = CheckMenuItemBuilder::with_id("autosave", "Autosave").checked(true).build(app)?;
    checks.push(("autosave".into(), autosave.clone()));
    let spellcheck = CheckMenuItemBuilder::with_id("spellcheck", "Spell Check").checked(true).build(app)?;
    checks.push(("spellcheck".into(), spellcheck.clone()));
    app.manage(CheckItems(checks));
    let settings = SubmenuBuilder::new(app, "Settings")
        .item(&theme)
        .item(&accent)
        .separator()
        .item(&autosave)
        .item(&spellcheck)
        .separator()
        .item(&item("check-updates", "Check for Updates…", None)?)
        .build()?;

    let find = item("find", "Find and Replace…", Some("CmdOrCtrl+F"))?;
    let menu = Menu::new(app)?;
    if cfg!(target_os = "macos") {
        // macOS: settings live in the app menu, and an Edit menu is required
        // for the standard clipboard shortcuts to reach the web view.
        let app_menu = SubmenuBuilder::new(app, "Marklet")
            .about(None)
            .separator()
            .item(&settings)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .item(&item("quit", quit_label, quit_accel)?)
            .build()?;
        let edit = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .separator()
            .item(&find)
            .build()?;
        menu.append_items(&[&app_menu, &file, &edit, &view])?;
    } else {
        let edit = SubmenuBuilder::new(app, "Edit").item(&find).build()?;
        menu.append_items(&[&file, &edit, &view, &settings])?;
    }
    Ok(menu)
}

pub fn handle_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref();
    if id == "quit" {
        // Goes through the window's close-requested handler, which asks about unsaved changes.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.close();
        }
        return;
    }
    // Clicking a check item only toggles that item; keep its group to one tick.
    if let Some((group, value)) = id.split_once(':') {
        if RADIO_GROUPS.contains(&group) {
            check_group(app, group, value);
        }
    }
    // The Autosave and Spell Check ticks are set by the front end
    // (set_menu_checked) once it has flipped and saved the setting, so the two
    // never disagree.
    let _ = app.emit("menu", id);
}

fn check_group(app: &AppHandle, group: &str, value: &str) {
    for (id, item) in &app.state::<CheckItems>().0 {
        if let Some((g, v)) = id.split_once(':') {
            if g == group {
                let _ = item.set_checked(v == value);
            }
        }
    }
}

/// Ticks `group:value` and unticks the rest of the group (theme, accent, view).
#[tauri::command]
pub fn check_menu_group(app: AppHandle, group: String, value: String) {
    check_group(&app, &group, &value);
}

/// Sets a check item's tick (used for Autosave and Spell Check).
#[tauri::command]
pub fn set_menu_checked(app: AppHandle, id: String, checked: bool) {
    if let Some((_, item)) = app.state::<CheckItems>().0.iter().find(|(i, _)| *i == id) {
        let _ = item.set_checked(checked);
    }
}
