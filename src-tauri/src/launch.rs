//! Files the OS asks Marklet to open: double-clicked `.md` files (command-line
//! arguments on Windows, open events on macOS and iOS), including when the app
//! is already running.

#[cfg(desktop)]
use std::path::Path;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

#[cfg(desktop)]
use crate::fs::is_markdown;

/// Files waiting for the front end, and whether it has started listening.
#[derive(Default)]
pub struct LaunchFiles(Mutex<(Vec<String>, bool)>);

/// Markdown files among command-line arguments (the first is the program).
#[cfg(desktop)]
pub fn files_from_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && is_markdown(Path::new(a)) && Path::new(a).is_file())
        .collect()
}

/// Hands files to the front end now if it is listening, else queues them.
pub fn open_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    let state = app.state::<LaunchFiles>();
    let mut guard = state.0.lock().unwrap();
    if guard.1 {
        let _ = app.emit("open-files", files);
    } else {
        guard.0.extend(files);
    }
}

/// Called once by the front end when it is ready: returns queued files, and
/// later ones arrive as `open-files` events.
#[tauri::command]
pub fn take_launch_files(state: tauri::State<LaunchFiles>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    guard.1 = true;
    // iOS: files the launch itself was for (see `cold_open`).
    #[cfg(target_os = "ios")]
    guard.0.extend(cold_open::FILES.lock().unwrap().drain(..));
    std::mem::take(&mut guard.0)
}

/// iOS: files iOS launched Marklet to open ("Open with", or Share › Marklet
/// while Marklet was not running). Tao, Tauri's window layer, passes on files
/// opened while the app runs, but drops the ones that arrive with the launch
/// (`scene:willConnectToSession:options:` ignores the options' URL contexts).
/// `install` wraps that method, between building the app and running it, to
/// note those files first; `take_launch_files` hands them to the front end.
#[cfg(target_os = "ios")]
pub mod cold_open {
    use std::ffi::{c_char, c_void};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_foundation::NSString;

    pub static FILES: Mutex<Vec<String>> = Mutex::new(Vec::new());
    /// Tao's own implementation, called after the files are noted.
    static ORIGINAL: AtomicUsize = AtomicUsize::new(0);

    type WillConnect = unsafe extern "C-unwind" fn(*mut AnyObject, *const c_void, *mut AnyObject, *mut AnyObject, *mut AnyObject);

    // The Objective-C runtime (libobjc, linked on every Apple platform).
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *const c_void;
        fn class_getInstanceMethod(class: *mut c_void, selector: *const c_void) -> *mut c_void;
        fn method_getImplementation(method: *mut c_void) -> *const c_void;
        fn method_setImplementation(method: *mut c_void, imp: *const c_void) -> *const c_void;
    }

    unsafe extern "C-unwind" fn will_connect(
        this: *mut AnyObject,
        selector: *const c_void,
        scene: *mut AnyObject,
        session: *mut AnyObject,
        options: *mut AnyObject,
    ) {
        if !options.is_null() {
            let contexts: *mut AnyObject = msg_send![options, URLContexts];
            if !contexts.is_null() {
                let all: *mut AnyObject = msg_send![contexts, allObjects];
                let count: usize = msg_send![all, count];
                for i in 0..count {
                    let context: *mut AnyObject = msg_send![all, objectAtIndex: i];
                    let url: *mut AnyObject = msg_send![context, URL];
                    if url.is_null() {
                        continue;
                    }
                    let is_file: bool = msg_send![url, isFileURL];
                    let path: *mut NSString = msg_send![url, path];
                    if let (true, Some(path)) = (is_file, path.as_ref()) {
                        FILES.lock().unwrap().push(path.to_string());
                    }
                }
            }
        }
        let original = ORIGINAL.load(Ordering::SeqCst);
        if original != 0 {
            let original: WillConnect = std::mem::transmute(original);
            original(this, selector, scene, session, options);
        }
    }

    /// Call once, after the app is built (tao has defined its scene delegate) and before it runs.
    pub fn install() {
        unsafe {
            let class = objc_getClass(c"TaoSceneDelegate".as_ptr());
            if class.is_null() {
                return;
            }
            let method = class_getInstanceMethod(class, sel_registerName(c"scene:willConnectToSession:options:".as_ptr()));
            if method.is_null() {
                return;
            }
            ORIGINAL.store(method_getImplementation(method) as usize, Ordering::SeqCst);
            method_setImplementation(method, will_connect as *const c_void);
        }
    }
}

/// A second launch (double-clicking another file) forwards its files here and
/// brings the existing window forward.
#[cfg(desktop)]
pub fn on_second_instance(app: &AppHandle, args: Vec<String>, _cwd: String) {
    open_files(app, files_from_args(args));
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
