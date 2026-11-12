//! The system material behind the main window.
//!
//! Windows 11 draws a blurred, tinted copy of the wallpaper behind a window
//! that asks for it ("Mica"). The app only has to let the material through:
//! the window is transparent (`transparent: true` in tauri.conf.json) and the
//! webview paints its own layers on top of it.

use tauri::{AppHandle, Manager, State, Theme};

use crate::state::AppState;

/// The native window theme for the app theme.
///
/// The material follows the app's own theme: a dark app over a light material
/// would read as a milky smudge, so the tint is forced when the theme says so.
/// "system" hands the decision back to the OS — and it has to be handed back
/// explicitly. The window manager remembers the last forced tint, so a stale
/// light one keeps drawing a bright frame around a dark app.
pub fn window_theme(theme: &str) -> Option<Theme> {
    match theme {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None,
    }
}

/// Ask the desktop window manager for the material. Returns whether the system
/// supports it: Windows 11 (22H2 and newer) does, older systems keep the flat
/// background and the frontend paints solid layers instead.
#[cfg(target_os = "windows")]
pub fn apply(window: &tauri::WebviewWindow, theme: Option<Theme>) -> bool {
    // The window's own theme drives both the material's tint and the frame
    // DWM draws around the transparent window. "None" makes it follow the OS
    // again — that is what undoes a forced tint.
    let _ = window.set_theme(theme);
    window_vibrancy::apply_mica(window, None).is_ok()
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &tauri::WebviewWindow, _theme: Option<Theme>) -> bool {
    false
}

/// Apply the material to the main window, using the app's current theme.
pub fn apply_to_main(app: &AppHandle, theme: &str) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };

    apply(&window, window_theme(theme))
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
    fn the_window_theme_follows_the_app_theme() {
        assert_eq!(window_theme("dark"), Some(Theme::Dark));
        assert_eq!(window_theme("light"), Some(Theme::Light));
    }

    #[test]
    fn the_system_theme_is_left_to_the_system() {
        // "system" and anything unknown: the material picks the OS preference.
        assert_eq!(window_theme("system"), None);
        assert_eq!(window_theme(""), None);
        assert_eq!(window_theme("sepia"), None);
    }
}
