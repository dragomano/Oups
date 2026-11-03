use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::WebviewWindow;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;

use crate::db;
use crate::identity;
use crate::locale::load_dict;
use crate::model::{Reminder, fmt_dt, now_local};
use crate::relative;
use crate::scheduler::{MISSED_LABEL, emit_changed, initial_next_due, popup_label};
use crate::settings::{self, Settings};
use crate::startup;
use crate::state::AppState;
use crate::tray;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub language: String,
    pub close_to_tray: bool,
    pub autostart_enabled: bool,
    pub theme: String,
    pub accent: String,
    pub popup_corner: String,
}

// A command payload built once per window — the size difference is harmless.
#[allow(clippy::large_enum_variant)]
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PopupData {
    Single { reminder: Reminder },
    Missed { reminders: Vec<Reminder> },
}

/// The frontend reports the interface ready (theme, language and data are in
/// place): reveal the main window unless this launch came from autostart.
#[tauri::command]
pub fn main_window_ready(app: AppHandle) -> Result<(), String> {
    let via_autostart = app.state::<startup::Launch>().via_autostart;
    if startup::reveal_on_ready(via_autostart) {
        tray::show_main(&app);
    }
    Ok(())
}

/// The popup interface reports ready: reveal the calling window. Both the
/// per-reminder popups and the `missed` list use this (same popup.html).
#[tauri::command]
pub fn popup_window_ready(window: WebviewWindow) -> Result<(), String> {
    if window.label() != MISSED_LABEL && !window.label().starts_with("reminder-") {
        return Err("not a popup window".into());
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

/// A window chrome action from the frontend: the main window is frameless, so
/// minimize / maximize / close are the app's own buttons. `close` is a normal
/// close request, which keeps the close-to-tray behavior in `lib.rs`.
#[derive(Debug, PartialEq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WindowControl {
    Minimize,
    ToggleMaximize,
    Close,
}

#[tauri::command]
pub fn window_control(window: WebviewWindow, action: WindowControl) -> Result<(), String> {
    // Rust has no `toggle_maximize`: the drag region's double click goes
    // through the window plugin command, so this picks the branch itself.
    let toggle = || {
        if window.is_maximized().map_err(|e| e.to_string())? {
            window.unmaximize()
        } else {
            window.maximize()
        }
        .map_err(|e| e.to_string())
    };
    match action {
        WindowControl::Minimize => window.minimize().map_err(|e| e.to_string()),
        WindowControl::ToggleMaximize => toggle(),
        WindowControl::Close => window.close().map_err(|e| e.to_string()),
    }
}

/// The caption button swaps between maximize and restore, and the state also
/// changes without that button (double click on the toolbar, Win+Arrow, snap),
/// so the frontend re-reads it whenever the window resizes.
#[tauri::command]
pub fn window_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

/// The app's display name for the title strip: `productName` in
/// tauri.conf.json, the same source the window title and the tray tooltip
/// use. The name is not translatable, so it never lives in a locale file.
#[tauri::command]
pub fn app_name(app: AppHandle) -> String {
    identity::display_name(&app)
}

/// Opens a link from a note in the system handler (browser or mail client).
/// The webview renders notes as plain text and holds no `opener:` capability
/// by design, so this command is the only path out of the app; the whitelist
/// is re-checked here, at the trust boundary, not only in the frontend.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !external_url_allowed(&url) {
        return Err("unsupported url scheme".into());
    }
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

/// http/https go to the browser, mailto to the mail client; everything else
/// (`file:`, `javascript:`, arbitrary custom schemes) stays closed. The
/// frontend normalizes a bare `www.` host to `https://` before calling.
fn external_url_allowed(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
}

#[tauri::command]
pub fn list_reminders(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    let conn = state.db_lock();
    db::all_reminders(&conn)
}

#[tauri::command]
pub fn upsert_reminder(
    state: State<'_, AppState>,
    app: AppHandle,
    mut reminder: Reminder,
) -> Result<Reminder, String> {
    db::sanitize(&mut reminder);
    reminder.next_due = initial_next_due(&reminder);
    {
        let conn = state.db_lock();
        db::upsert_reminder(&conn, &reminder)?;
    }
    emit_changed(&app);
    Ok(reminder)
}

#[tauri::command]
pub fn delete_reminder(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    {
        let conn = state.db_lock();
        db::delete_reminder(&conn, &id)?;
    }
    state.missed_lock().retain(|r| r.id != id);
    if let Some(win) = app.get_webview_window(&popup_label(&id)) {
        let _ = win.close();
    }
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn set_reminder_enabled(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<Reminder, String> {
    let mut reminder = {
        let conn = state.db_lock();
        db::get_reminder(&conn, &id)?.ok_or("reminder not found")?
    };
    reminder.enabled = enabled;
    reminder.next_due = initial_next_due(&reminder);
    {
        let conn = state.db_lock();
        db::upsert_reminder(&conn, &reminder)?;
    }
    emit_changed(&app);
    Ok(reminder)
}

#[tauri::command]
pub fn set_reminder_completed(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    completed: bool,
) -> Result<Reminder, String> {
    let mut reminder = {
        let conn = state.db_lock();
        db::get_reminder(&conn, &id)?.ok_or("reminder not found")?
    };
    reminder.completed = completed;
    reminder.next_due = initial_next_due(&reminder);
    {
        let conn = state.db_lock();
        db::upsert_reminder(&conn, &reminder)?;
    }
    emit_changed(&app);
    Ok(reminder)
}

/// Postpone a reminder by `minutes` from now: rewrite next_due and close its
/// popup. Works both for a live popup and for an entry in the missed list.
fn snooze_inner(state: &AppState, app: &AppHandle, id: &str, minutes: i64) -> Result<(), String> {
    let next = fmt_dt(now_local() + chrono::Duration::minutes(minutes));
    {
        let conn = state.db_lock();
        db::set_next_due(&conn, id, Some(next))?;
        db::set_enabled(&conn, id, true)?;
        db::set_completed(&conn, id, false)?;
    }
    if let Some(win) = app.get_webview_window(&popup_label(id)) {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
pub fn snooze_reminder(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    minutes: i64,
) -> Result<(), String> {
    snooze_inner(&state, &app, &id, minutes)?;
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn snooze_missed_all(
    state: State<'_, AppState>,
    app: AppHandle,
    minutes: i64,
) -> Result<(), String> {
    let ids: Vec<String> = state.missed_lock().iter().map(|r| r.id.clone()).collect();
    for id in &ids {
        snooze_inner(&state, &app, id, minutes)?;
    }
    state.missed_lock().clear();
    if let Some(win) = app.get_webview_window(MISSED_LABEL) {
        let _ = win.close();
    }
    emit_changed(&app);
    Ok(())
}

/// The popup window pulls its own data by window label, avoiding event races.
#[tauri::command]
pub fn get_popup_data(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<PopupData, String> {
    let label = window.label().to_string();
    if let Some(id) = label.strip_prefix("reminder-") {
        let conn = state.db_lock();
        let reminder = db::get_reminder(&conn, id)?.ok_or("reminder not found")?;
        Ok(PopupData::Single { reminder })
    } else if label == MISSED_LABEL {
        let reminders = state.missed_lock().clone();
        Ok(PopupData::Missed { reminders })
    } else {
        Err("not a popup window".into())
    }
}

#[tauri::command]
pub fn dismiss_missed(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state.missed_lock().clear();
    if let Some(win) = app.get_webview_window(MISSED_LABEL) {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
pub fn dismiss_missed_one(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    {
        let mut cache = state.missed_lock();
        cache.retain(|r| r.id != id);
        if !cache.is_empty() {
            return Ok(());
        }
    }
    if let Some(win) = app.get_webview_window(MISSED_LABEL) {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>, app: AppHandle) -> Result<SettingsView, String> {
    let (language, close_to_tray, theme, accent, popup_corner) = {
        let s = state.settings_lock();
        (
            s.language.clone(),
            s.close_to_tray,
            s.theme.clone(),
            s.accent.clone(),
            s.popup_corner.clone(),
        )
    };
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    Ok(SettingsView {
        language,
        close_to_tray,
        autostart_enabled,
        theme,
        accent,
        popup_corner,
    })
}

#[tauri::command]
pub fn set_settings(
    state: State<'_, AppState>,
    app: AppHandle,
    settings: Settings,
) -> Result<(), String> {
    let mut s = settings;
    if !crate::locale::available_codes().contains(&s.language) {
        s.language = settings::load(&state.db_lock()).language;
    }
    if !settings::THEMES.contains(&s.theme.as_str()) {
        s.theme = "system".into();
    }
    if !settings::ACCENTS.contains(&s.accent.as_str()) {
        s.accent = "blue".into();
    }
    if !settings::POPUP_POSITIONS.contains(&s.popup_corner.as_str()) {
        s.popup_corner = "bottom-right".into();
    }
    {
        let conn = state.db_lock();
        settings::save(&conn, &s)?;
    }
    *state.settings_lock() = s;
    tray::rebuild(&app);
    app.emit("settings-changed", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Languages the locales folder provides; each file declares its own code and
/// native display name via its `meta` block.
#[tauri::command]
pub fn list_locales() -> Vec<crate::locale::LocaleInfo> {
    crate::locale::available()
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    autostart.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_locale(lang: String) -> Result<Value, String> {
    Ok(load_dict(&lang))
}

#[tauri::command]
pub fn export_reminders(state: State<'_, AppState>, path: String) -> Result<usize, String> {
    let reminders = {
        let conn = state.db_lock();
        db::all_reminders(&conn)?
    };
    let count = reminders.len();
    let file = serde_json::json!({
        "version": 1,
        "exportedAt": fmt_dt(now_local()),
        "reminders": reminders,
    });
    let text = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(count)
}

fn insert_imported(
    state: &AppState,
    app: &AppHandle,
    reminders: Vec<Reminder>,
) -> Result<usize, String> {
    let mut count = 0usize;
    // One import moment for the whole file, so relative timestamps (`"+2h"`,
    // used by the demo templates) all resolve against the same instant.
    let imported_at = now_local();
    for mut r in reminders {
        r.id.clear(); // force a fresh id so imports never overwrite existing rows
        // Resolve before `sanitize`: it replaces an unrecognized `startAt`
        // with "now", which would swallow a relative offset.
        relative::resolve_reminder(&mut r, imported_at);
        db::sanitize(&mut r);
        r.next_due = initial_next_due(&r);
        let conn = state.db_lock();
        db::upsert_reminder(&conn, &r).map_err(|e| e.to_string())?;
        count += 1;
    }
    emit_changed(app);
    Ok(count)
}

#[tauri::command]
pub fn import_reminders(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
) -> Result<usize, String> {
    // Wise Reminder *.dat / *.wrm are detected by extension; everything
    // else is our own JSON format.
    if path.to_lowercase().ends_with(".dat") {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let reminders = crate::wise::parse_dat(&bytes)?;
        return insert_imported(&state, &app, reminders);
    }
    if path.to_lowercase().ends_with(".wrm") {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let reminders = crate::wrm::parse_wrm(&text)?;
        return insert_imported(&state, &app, reminders);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let array = match &value {
        Value::Array(arr) => arr.clone(),
        Value::Object(obj) => obj
            .get("reminders")
            .and_then(|v| v.as_array())
            .cloned()
            .ok_or("no reminders array in file")?,
        _ => return Err("unexpected file format".into()),
    };
    let reminders: Vec<Reminder> = array
        .into_iter()
        .filter_map(|item| serde_json::from_value::<Reminder>(item).ok())
        .map(|mut r| {
            // JSON imports start fresh; the Wise parser keeps its own state.
            r.enabled = true;
            r.completed = false;
            r.fired_count = 0;
            r
        })
        .collect();
    insert_imported(&state, &app, reminders)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Priority;

    fn demo_source(lang: &str) -> &'static str {
        match lang {
            "ru" => include_str!("../../demo/reminders.ru.json"),
            "en" => include_str!("../../demo/reminders.en.json"),
            other => panic!("unknown demo set: {other}"),
        }
    }

    /// Walks the same path as `import_reminders` for a JSON payload, minus the
    /// database: pull the `reminders` array, deserialize, drop the failures,
    /// then materialize relative timestamps and recompute `next_due` exactly as
    /// `insert_imported` does.
    fn parse_demo(json: &str) -> (usize, Vec<Reminder>) {
        let value: Value = serde_json::from_str(json).expect("demo file is valid JSON");
        assert_eq!(
            value["version"], 1,
            "demo file must use the native envelope"
        );
        let array = value["reminders"]
            .as_array()
            .expect("demo file has a reminders array")
            .clone();
        let imported_at = now_local();
        let parsed: Vec<Reminder> = array
            .iter()
            .filter_map(|item| serde_json::from_value::<Reminder>(item.clone()).ok())
            .map(|mut r| {
                r.enabled = true;
                r.completed = false;
                r.fired_count = 0;
                relative::resolve_reminder(&mut r, imported_at);
                r.next_due = initial_next_due(&r);
                r
            })
            .collect();
        (array.len(), parsed)
    }

    #[test]
    fn demo_sets_import_without_dropping_records() {
        for lang in ["ru", "en"] {
            let (total, parsed) = parse_demo(demo_source(lang));
            assert!(total > 0, "{lang} demo set is empty");
            // `filter_map(..ok())` skips anything serde rejects, silently: a
            // shape change in the demo files would empty the app without an
            // error, so the counts must match.
            assert_eq!(
                total,
                parsed.len(),
                "{lang} demo set has records the importer would skip"
            );
            for r in &parsed {
                assert!(!r.title.is_empty(), "{lang}: reminder without a title");
                assert!(r.enabled && !r.completed);
            }
        }
    }

    #[test]
    fn demo_sets_stay_active_after_import() {
        // Timestamps in the demo files are relative, so importing a checkout of
        // any age still yields a live dataset: every next occurrence is in the
        // future, and one-shots do not fire on the first scheduler tick — that
        // would pop them up and immediately mark them completed.
        for lang in ["ru", "en"] {
            let (_, parsed) = parse_demo(demo_source(lang));
            let now = fmt_dt(now_local());
            for r in &parsed {
                let due = r
                    .next_due
                    .as_deref()
                    .unwrap_or_else(|| panic!("{lang}: {:?} has no next occurrence", r.title));
                assert!(
                    due > now.as_str(),
                    "{lang}: {:?} is already overdue right after import ({due})",
                    r.title
                );
                if matches!(r.recurrence, crate::model::Recurrence::Once) {
                    assert!(
                        r.start_at > now,
                        "{lang}: one-shot {:?} starts in the past and would fire immediately",
                        r.title
                    );
                }
            }
        }
    }

    #[test]
    fn demo_sets_populate_all_four_quadrants_after_import() {
        // The dataset is arranged so the Eisenhower matrix has no empty cell;
        // relative timestamps keep that true on any day the file is imported.
        for lang in ["ru", "en"] {
            let (_, parsed) = parse_demo(demo_source(lang));
            let urgent_end = fmt_dt(now_local() + chrono::Duration::hours(24));
            let important =
                |r: &Reminder| matches!(r.priority, Priority::High | Priority::Critical);
            let urgent = |r: &Reminder| {
                r.next_due
                    .as_deref()
                    .is_some_and(|due| due <= urgent_end.as_str())
            };
            for (cell, filled) in [
                (
                    "urgent + important",
                    parsed.iter().any(|r| important(r) && urgent(r)),
                ),
                (
                    "urgent + trivial",
                    parsed.iter().any(|r| !important(r) && urgent(r)),
                ),
                (
                    "relaxed + important",
                    parsed.iter().any(|r| important(r) && !urgent(r)),
                ),
                (
                    "relaxed + trivial",
                    parsed.iter().any(|r| !important(r) && !urgent(r)),
                ),
            ] {
                assert!(filled, "{lang} demo set leaves the {cell} quadrant empty");
            }
        }
    }

    #[test]
    fn demo_sets_cover_every_priority() {
        for lang in ["ru", "en"] {
            let (_, parsed) = parse_demo(demo_source(lang));
            for want in [
                Priority::Low,
                Priority::Normal,
                Priority::High,
                Priority::Critical,
            ] {
                assert!(
                    parsed.iter().any(|r| r.priority == want),
                    "{lang} demo set is missing {want:?}"
                );
            }
        }
    }

    #[test]
    fn demo_sets_cover_every_recurrence() {
        for lang in ["ru", "en"] {
            let (_, parsed) = parse_demo(demo_source(lang));
            for name in ["once", "daily", "weekly", "monthly", "yearly", "interval"] {
                assert!(
                    parsed
                        .iter()
                        .any(|r| recurrence_name(&r.recurrence) == name),
                    "{lang} demo set has no {name} reminder"
                );
            }
        }
    }

    fn recurrence_name(r: &crate::model::Recurrence) -> &'static str {
        use crate::model::Recurrence::*;
        match r {
            Once => "once",
            Daily => "daily",
            Weekly { .. } => "weekly",
            Monthly { .. } => "monthly",
            Yearly { .. } => "yearly",
            Interval { .. } => "interval",
        }
    }

    /// The caption buttons live in `WindowControls.svelte`; these are the exact
    /// strings `api.windowControl` sends.
    #[test]
    fn window_control_accepts_the_frontend_action_names() {
        for (wire, want) in [
            ("\"minimize\"", WindowControl::Minimize),
            ("\"toggle-maximize\"", WindowControl::ToggleMaximize),
            ("\"close\"", WindowControl::Close),
        ] {
            assert_eq!(serde_json::from_str::<WindowControl>(wire).ok(), Some(want));
        }
        assert!(serde_json::from_str::<WindowControl>("\"toggleMaximize\"").is_err());
    }

    /// The whitelist behind `open_external`: notes must never learn to open
    /// `file:`, `javascript:` or arbitrary custom schemes.
    #[test]
    fn external_urls_are_limited_to_safe_schemes() {
        for url in [
            "https://example.com",
            "http://example.com/page?q=1",
            "HTTPS://EXAMPLE.COM",
            "mailto:user@example.com",
        ] {
            assert!(external_url_allowed(url), "{url} must be allowed");
        }
        for url in [
            "",
            "example.com",
            "www.example.com",
            "javascript:alert(1)",
            "vbscript:x",
            "file:///C:/Windows/System32",
            "ftp://example.com/file",
            // Not "http://": the prefix must include the scheme delimiter.
            "httpsomething://nope",
        ] {
            assert!(!external_url_allowed(url), "{url} must be rejected");
        }
    }
}
