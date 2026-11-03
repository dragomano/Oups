//! The system material behind the main window.
//!
//! Windows 11 draws a blurred, tinted copy of the wallpaper behind a window
//! that asks for it ("Mica"). The app only has to let the material through:
//! the window is transparent (`transparent: true` in tauri.conf.json) and the
//! webview paints its own layers on top of it.

use tauri::{AppHandle, Manager, State};

use crate::state::AppState;

/// The material follows the app's own theme: a dark app over a light material
/// would read as a milky smudge, so the tint is forced when the theme says so.
/// `None` leaves the decision to the system.
pub fn tint(theme: &str) -> Option<bool> {
    match theme {
        "dark" => Some(true),
        "light" => Some(false),
        _ => None,
    }
}

/// Ask the desktop window manager for the material. Returns whether the system
/// supports it: Windows 11 (22H2 and newer) does, older systems keep the flat
/// background and the frontend paints solid layers instead.
#[cfg(target_os = "windows")]
pub fn apply(window: &tauri::WebviewWindow, dark: Option<bool>) -> bool {
    window_vibrancy::apply_mica(window, dark).is_ok()
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &tauri::WebviewWindow, _dark: Option<bool>) -> bool {
    false
}

/// Apply the material to the main window, using the app's current theme.
pub fn apply_to_main(app: &AppHandle, theme: &str) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };

    apply(&window, tint(theme))
}

/// Ask for the system material behind the main window. The frontend paints
/// translucent layers when the material is there and solid ones when it is not,
/// so the answer decides how the window looks.
#[tauri::command]
pub fn window_backdrop(app: AppHandle, state: State<'_, AppState>) -> bool {
    let theme = state.settings_lock().theme.clone();

    apply_to_main(&app, &theme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tint_follows_the_app_theme() {
        assert_eq!(tint("dark"), Some(true));
        assert_eq!(tint("light"), Some(false));
    }

    #[test]
    fn the_system_theme_is_left_to_the_system() {
        // "system" and anything unknown: the material picks the OS preference.
        assert_eq!(tint("system"), None);
        assert_eq!(tint(""), None);
        assert_eq!(tint("sepia"), None);
    }
}
