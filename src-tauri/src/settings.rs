use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::locale;

pub const THEMES: [&str; 3] = ["system", "dark", "light"];
/// Wheel order, matching app.css: OKLCH L 0.55 / C 0.155, hue step 40°.
pub const ACCENTS: [&str; 9] = [
    "red", "orange", "amber", "green", "teal", "cyan", "blue", "violet", "pink",
];
/// Screen positions where reminder popups may appear (3×3 grid order:
/// corners, edge centers, center).
pub const POPUP_POSITIONS: [&str; 9] = [
    "top-left",
    "center-top",
    "top-right",
    "center-left",
    "center",
    "center-right",
    "bottom-left",
    "center-bottom",
    "bottom-right",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub language: String,
    pub close_to_tray: bool,
    /// UI theme: "system" follows the OS setting, "dark"/"light" force it.
    pub theme: String,
    /// Accent color preset for buttons, icons and active elements.
    pub accent: String,
    /// Screen corner where reminder popups appear.
    pub popup_corner: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            // Provisional: load()/save() always re-validate against the
            // languages the locales folder actually provides.
            language: "en".into(),
            close_to_tray: true,
            theme: "system".into(),
            accent: "blue".into(),
            popup_corner: "bottom-right".into(),
        }
    }
}

/// Match a system locale string ("ru-RU", "en_US", "pt") against the available
/// language codes: full code first, then the base language ("ru-RU" -> "ru").
/// Comparison is case-insensitive; the returned code keeps the file's casing.
fn match_system_locale(system: Option<&str>, codes: &[String]) -> Option<String> {
    let system = system?.replace('_', "-");
    let system_lower = system.to_lowercase();
    if let Some(code) = codes.iter().find(|c| c.to_lowercase() == system_lower) {
        return Some(code.clone());
    }
    let base = system_lower.split('-').next()?;
    codes
        .iter()
        .find(|c| c.to_lowercase().split('-').next() == Some(base))
        .cloned()
}

/// Resolution order: saved language (if still available) -> system language
/// (first run, or the saved language vanished) -> first available locale.
fn resolve_language(saved: Option<String>) -> String {
    let codes = locale::available_codes();
    if let Some(lang) = saved
        && codes.contains(&lang)
    {
        return lang;
    }
    if let Some(matched) = match_system_locale(sys_locale::get_locale().as_deref(), &codes) {
        return matched;
    }
    codes.into_iter().next().unwrap_or_else(|| "en".into())
}

fn valid_theme(v: &str) -> bool {
    THEMES.contains(&v)
}

fn valid_accent(v: &str) -> bool {
    ACCENTS.contains(&v)
}

pub fn load(conn: &Connection) -> Settings {
    let saved = db::get_setting(conn, "language").unwrap_or(None);
    let mut s = Settings {
        language: resolve_language(saved.clone()),
        ..Settings::default()
    };
    if saved.is_none() {
        // Persist the auto-detected default so the choice stays stable
        // even if the locales set changes later.
        let _ = db::set_setting(conn, "language", &s.language);
    }
    if let Ok(Some(v)) = db::get_setting(conn, "close_to_tray") {
        s.close_to_tray = v != "0";
    }
    if let Ok(Some(v)) = db::get_setting(conn, "theme")
        && valid_theme(&v)
    {
        s.theme = v;
    }
    if let Ok(Some(v)) = db::get_setting(conn, "accent")
        && valid_accent(&v)
    {
        s.accent = v;
    }
    if let Ok(Some(v)) = db::get_setting(conn, "popup_corner")
        && POPUP_POSITIONS.contains(&v.as_str())
    {
        s.popup_corner = v;
    }
    s
}

pub fn save(conn: &Connection, s: &Settings) -> Result<(), String> {
    let mut s = s.clone();
    // Clamp values that may come from the UI or edited settings stores.
    s.language = resolve_language(Some(s.language));
    if !valid_theme(&s.theme) {
        s.theme = "system".into();
    }
    if !valid_accent(&s.accent) {
        s.accent = "blue".into();
    }
    if !POPUP_POSITIONS.contains(&s.popup_corner.as_str()) {
        s.popup_corner = "bottom-right".into();
    }
    db::set_setting(conn, "language", &s.language)?;
    db::set_setting(
        conn,
        "close_to_tray",
        if s.close_to_tray { "1" } else { "0" },
    )?;
    db::set_setting(conn, "theme", &s.theme)?;
    db::set_setting(conn, "accent", &s.accent)?;
    db::set_setting(conn, "popup_corner", &s.popup_corner)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn codes(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn system_locale_matches_base_language() {
        assert_eq!(
            match_system_locale(Some("ru-RU"), &codes(&["en", "ru"])),
            Some("ru".into())
        );
        assert_eq!(
            match_system_locale(Some("en-US"), &codes(&["en", "ru"])),
            Some("en".into())
        );
    }

    #[test]
    fn system_locale_prefers_exact_regional_match() {
        assert_eq!(
            match_system_locale(Some("pt-BR"), &codes(&["en", "pt", "pt-BR"])),
            Some("pt-BR".into())
        );
        assert_eq!(
            match_system_locale(Some("pt-PT"), &codes(&["en", "pt", "pt-BR"])),
            Some("pt".into())
        );
    }

    #[test]
    fn system_locale_underscore_separator_is_accepted() {
        assert_eq!(
            match_system_locale(Some("ru_RU"), &codes(&["en", "ru"])),
            Some("ru".into())
        );
    }

    #[test]
    fn system_locale_without_match_is_none() {
        assert_eq!(
            match_system_locale(Some("de-DE"), &codes(&["en", "ru"])),
            None
        );
        assert_eq!(match_system_locale(None, &codes(&["en"])), None);
        assert_eq!(match_system_locale(Some(""), &codes(&["en"])), None);
    }
}
