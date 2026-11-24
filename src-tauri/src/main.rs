// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Some Linux graphics stacks lose or crop WebKitGTK surfaces on resize
    // or when a hidden WebView is mapped. Use software compositing for Oups.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        // SAFETY: This runs at process entry, before GTK, WebKit or Tauri
        // can spawn threads that read the environment.
        unsafe { std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1") };
    }
    scheduler_lib::run()
}
