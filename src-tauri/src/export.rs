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

/// iOS: Tauri has no printing there. PDF export will come through WKWebView's
/// createPDF and the share sheet (phase 5 of docs/IOS-BRIEF.md).
#[cfg(mobile)]
#[tauri::command]
pub async fn print_to_pdf(path: String) -> Result<(), String> {
    let _ = path;
    Err("PDF export isn't available on iPhone and iPad yet. Export to HTML works.".into())
}
