//! Export helpers. PDF export prints the web view itself (styles/print.css
//! hides everything but the preview); HTML export is assembled in the front
//! end and only needs local images read back as data URIs.

use base64::Engine;

/// Largest image inlined into an exported HTML file.
const MAX_INLINE_IMAGE: u64 = 20 * 1024 * 1024;

/// Reads a local image as a `data:` URI for a standalone HTML export.
#[tauri::command]
pub async fn read_image_data_uri(path: String) -> Result<String, String> {
    let size = std::fs::metadata(&path).map_err(|e| format!("Could not read {path}: {e}"))?.len();
    if size > MAX_INLINE_IMAGE {
        return Err(format!("{path} is too large to embed"));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Windows: WebView2 prints the page straight to `path`, no dialog.
#[cfg(windows)]
#[tauri::command]
pub async fn print_to_pdf(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_2, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let fail = tx.clone();
    window
        .with_webview(move |webview| {
            let start = || -> windows::core::Result<()> {
                unsafe {
                    let core = webview.controller().CoreWebView2()?;
                    let settings = core
                        .cast::<ICoreWebView2_2>()?
                        .Environment()?
                        .cast::<ICoreWebView2Environment6>()?
                        .CreatePrintSettings()?;
                    settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    // Page margins, in inches.
                    settings.SetMarginTop(0.6)?;
                    settings.SetMarginBottom(0.6)?;
                    settings.SetMarginLeft(0.6)?;
                    settings.SetMarginRight(0.6)?;
                    let tx = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                        let _ = tx.send(match result {
                            Ok(()) if ok => Ok(()),
                            Ok(()) => Err("The PDF could not be written.".into()),
                            Err(e) => Err(e.message()),
                        });
                        Ok(())
                    }));
                    core.cast::<ICoreWebView2_7>()?
                        .PrintToPdf(&HSTRING::from(path.as_str()), &settings, &handler)
                }
            };
            if let Err(e) = start() {
                let _ = fail.send(Err(format!("PDF export failed: {}", e.message())));
            }
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

/// macOS: WKWebView has no silent print-to-file here, so this opens the print
/// dialog, whose PDF button saves the file.
#[cfg(all(desktop, not(windows)))]
#[tauri::command]
pub async fn print_to_pdf(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    let _ = path;
    window.print().map_err(|e| e.to_string())
}

/// iOS: the system print sheet, laid out with the print stylesheet like the
/// desktop's PDF. Its Share button saves the PDF to Files or sends it on, as
/// the macOS print dialog's PDF button does. `title` names the PDF.
#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn print_to_pdf(window: tauri::WebviewWindow, path: String, title: Option<String>) -> Result<(), String> {
    let _ = path;
    let title = title.unwrap_or_else(|| "Marklet".into());
    window
        .with_webview(move |webview| unsafe { ios::print(webview.inner().cast(), &title) })
        .map_err(|e| e.to_string())
}

/// iOS: the share sheet for a file (Save to Files, AirDrop, Mail, Messages…).
#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn share_file(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).is_file() {
        return Err(format!("Could not share {path}: it is not saved yet."));
    }
    window
        .with_webview(move |webview| unsafe { ios::share(webview.inner().cast(), webview.view_controller().cast(), &path) })
        .map_err(|e| e.to_string())
}

/// iOS: an export (`name`, `text`) written to the app's temporary folder and
/// handed to the share sheet; nothing is left in the notes folder.
#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn share_export(window: tauri::WebviewWindow, name: String, text: String) -> Result<(), String> {
    let file = std::path::Path::new(&name).file_name().ok_or("Not a file name")?.to_owned();
    let dir = std::env::temp_dir().join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not export: {e}"))?;
    let path = dir.join(file);
    std::fs::write(&path, text).map_err(|e| format!("Could not export: {e}"))?;
    share_file(window, path.to_string_lossy().into_owned()).await
}

/// Other mobile targets (not built today): no printing or sharing yet.
#[cfg(all(mobile, not(target_os = "ios")))]
#[tauri::command]
pub async fn print_to_pdf(path: String) -> Result<(), String> {
    let _ = path;
    Err("PDF export isn't available here yet.".into())
}

#[cfg(all(mobile, not(target_os = "ios")))]
#[tauri::command]
pub async fn share_file(path: String) -> Result<(), String> {
    let _ = path;
    Err("Sharing isn't available here yet.".into())
}

#[cfg(all(mobile, not(target_os = "ios")))]
#[tauri::command]
pub async fn share_export(name: String, text: String) -> Result<(), String> {
    let _ = (name, text);
    Err("Sharing isn't available here yet.".into())
}

/// UIKit calls for printing and the share sheet. They run on the main thread
/// (`with_webview` calls its closure there); `webview` is the app's WKWebView
/// and `controller` the view controller that holds it.
#[cfg(target_os = "ios")]
mod ios {
    use block2::Block;
    use objc2::rc::{Allocated, Retained};
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSArray, NSString, NSURL};

    /// iPad shows these sheets as popovers, which must point at something.
    unsafe fn is_pad() -> bool {
        let device: *mut AnyObject = msg_send![class!(UIDevice), currentDevice];
        let idiom: isize = msg_send![device, userInterfaceIdiom];
        idiom == 1 // UIUserInterfaceIdiomPad
    }

    /// A point near the top right of the view, where the Export and menu buttons are.
    unsafe fn anchor(view: *mut AnyObject) -> CGRect {
        let bounds: CGRect = msg_send![view, bounds];
        CGRect::new(CGPoint::new((bounds.size.width - 60.0).max(0.0), 40.0), CGSize::new(1.0, 1.0))
    }

    pub unsafe fn print(webview: *mut AnyObject, title: &str) {
        let info: *mut AnyObject = msg_send![class!(UIPrintInfo), printInfo];
        let name = NSString::from_str(title);
        let _: () = msg_send![info, setJobName: &*name];
        let formatter: *mut AnyObject = msg_send![webview, viewPrintFormatter];
        let controller: *mut AnyObject = msg_send![class!(UIPrintInteractionController), sharedPrintController];
        let _: () = msg_send![controller, setPrintInfo: info];
        let _: () = msg_send![controller, setPrintFormatter: formatter];
        let done: Option<&Block<dyn Fn(*mut AnyObject, Bool, *mut AnyObject)>> = None;
        if is_pad() {
            let _: Bool = msg_send![controller, presentFromRect: anchor(webview), inView: webview, animated: true, completionHandler: done];
        } else {
            let _: Bool = msg_send![controller, presentAnimated: true, completionHandler: done];
        }
    }

    pub unsafe fn share(webview: *mut AnyObject, controller: *mut AnyObject, path: &str) {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let items = NSArray::from_retained_slice(&[url]);
        let none: Option<&AnyObject> = None;
        let alloc: Allocated<AnyObject> = msg_send![class!(UIActivityViewController), alloc];
        let sheet: Retained<AnyObject> = msg_send![alloc, initWithActivityItems: &*items, applicationActivities: none];
        if is_pad() {
            let popover: *mut AnyObject = msg_send![&*sheet, popoverPresentationController];
            if !popover.is_null() {
                let _: () = msg_send![popover, setSourceView: webview];
                let _: () = msg_send![popover, setSourceRect: anchor(webview)];
            }
        }
        let done: Option<&Block<dyn Fn()>> = None;
        let _: () = msg_send![controller, presentViewController: &*sheet, animated: true, completion: done];
    }
}
