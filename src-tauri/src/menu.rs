//! Native menu bar. File actions are forwarded to the front end as a `menu`
//! event carrying the item id; the front end owns documents and dialogs.

use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, Menu, MenuEvent, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

const THEMES: [(&str, &str); 3] = [("system", "System"), ("light", "Light"), ("dark", "Dark")];

/// Check items by id (`theme:*`, `autosave`), so their ticks can follow the front end's settings.
pub struct CheckItems(Vec<(String, CheckMenuItem<Wry>)>);

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, label);
        match accel {
            Some(a) => b.accelerator(a).build(app),
            None => b.build(app),
        }
    };

    let quit_label = if cfg!(target_os = "macos") { "Quit Nova MD" } else { "Exit" };
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
        .item(&item("close-tab", "Close Tab", Some("CmdOrCtrl+W"))?);
    if !cfg!(target_os = "macos") {
        file = file.separator().item(&item("quit", quit_label, quit_accel)?);
    }
    let file = file.build()?;

    let mut check_items = Vec::new();
    let mut theme = SubmenuBuilder::new(app, "Theme");
    for (id, label) in THEMES {
        let check = CheckMenuItemBuilder::with_id(format!("theme:{id}"), label)
            .checked(id == "system")
            .build(app)?;
        theme = theme.item(&check);
        check_items.push((format!("theme:{id}"), check));
    }
    let theme = theme.build()?;
    let autosave = CheckMenuItemBuilder::with_id("autosave", "Autosave").checked(true).build(app)?;
    check_items.push(("autosave".into(), autosave.clone()));
    app.manage(CheckItems(check_items));

    let menu = Menu::new(app)?;
    if cfg!(target_os = "macos") {
        // macOS: settings live in the app menu, and an Edit menu is required
        // for the standard clipboard shortcuts to reach the web view.
        let app_menu = SubmenuBuilder::new(app, "Nova MD")
            .about(None)
            .separator()
            .item(&settings_menu(app, &theme, &autosave)?)
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
            .build()?;
        menu.append_items(&[&app_menu, &file, &edit])?;
    } else {
        menu.append_items(&[&file, &settings_menu(app, &theme, &autosave)?])?;
    }
    Ok(menu)
}

fn settings_menu(app: &AppHandle, theme: &Submenu<Wry>, autosave: &CheckMenuItem<Wry>) -> tauri::Result<Submenu<Wry>> {
    SubmenuBuilder::new(app, "Settings").item(theme).item(autosave).build()
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
    if let Some(theme) = id.strip_prefix("theme:") {
        check_theme(app, theme);
    }
    // Autosave's tick is set by the front end (set_menu_checked) once it has
    // flipped and saved the setting, so the two never disagree.
    let _ = app.emit("menu", id);
}

fn check_theme(app: &AppHandle, theme: &str) {
    for (id, item) in &app.state::<CheckItems>().0 {
        if let Some(t) = id.strip_prefix("theme:") {
            let _ = item.set_checked(t == theme);
        }
    }
}

/// Lets the front end tick the saved theme at startup.
#[tauri::command]
pub fn sync_theme_menu(app: AppHandle, theme: String) {
    check_theme(&app, &theme);
}

/// Sets a check item's tick (used for Autosave).
#[tauri::command]
pub fn set_menu_checked(app: AppHandle, id: String, checked: bool) {
    if let Some((_, item)) = app.state::<CheckItems>().0.iter().find(|(i, _)| *i == id) {
        let _ = item.set_checked(checked);
    }
}
