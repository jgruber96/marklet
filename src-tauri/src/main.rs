// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The desktop entry point. The app itself lives in lib.rs, which iOS starts directly.
fn main() {
    marklet_lib::run()
}
