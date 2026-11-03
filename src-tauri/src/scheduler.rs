use chrono::NaiveDateTime;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::time::Duration;

use crate::db;
use crate::identity::display_name;
use crate::model::{EndMode, Recurrence, Reminder, fmt_dt, now_local, parse_dt};
use crate::recurrence::next_after;
use crate::startup;
use crate::state::AppState;

pub const POPUP_PREFIX: &str = "reminder-";
pub const MISSED_LABEL: &str = "missed";
const TICK_SECS: u64 = 10;

pub fn popup_label(id: &str) -> String {
    format!("{POPUP_PREFIX}{id}")
}

/// After an occurrence has fired, compute and store the next occurrence.
/// `fired_for` is the due timestamp that triggered this fire (not `now`),
/// so a snoozed firing does not skip ahead on the recurrence grid.
fn advance_after_fire(r: &Reminder, fired_for: &str) -> Option<String> {
    let start = parse_dt(&r.start_at)?;
    let from = parse_dt(fired_for).unwrap_or_else(now_local);
    let next = next_after(start, &r.recurrence, from);
    let fired_total = r.fired_count + 1;
    let next = match &r.end_mode {
        EndMode::Never => next,
        EndMode::AfterCount { n } => {
            if fired_total >= *n {
                None
            } else {
                next
            }
        }
        EndMode::Until { date } => next.filter(|dt| until_allows(*dt, date)),
    };
    next.map(fmt_dt)
}

/// The `until` bound is inclusive and compares calendar dates only. Shared by
/// the advance after a fire and the first computation, so a rule that has
/// already passed its end date yields no occurrence either way.
fn until_allows(dt: NaiveDateTime, until: &str) -> bool {
    let date = dt.date().format("%Y-%m-%d").to_string();
    date.as_str() <= until
}

/// First due timestamp used when a reminder is created/edited/enabled: the
/// next occurrence the rule has left, exactly as after a fire.
pub fn initial_next_due(r: &Reminder) -> Option<String> {
    initial_next_due_at(r, now_local())
}

/// Compute the first occurrence against an explicit local wall-clock time.
pub(crate) fn initial_next_due_at(r: &Reminder, now: NaiveDateTime) -> Option<String> {
    if !r.enabled || r.completed {
        return None;
    }
    let start = parse_dt(&r.start_at)?;
    let next = match r.recurrence {
        // A one-shot in the past fires immediately on the next tick.
        Recurrence::Once => Some(start),
        _ => next_after(start, &r.recurrence, now),
    };
    let next = match &r.end_mode {
        // An end date behind the next occurrence (an imported or back-dated
        // rule) leaves nothing to run, exactly as it does after a fire.
        EndMode::Until { date } => next.filter(|dt| until_allows(*dt, date)),
        // Every allowed repeat has already fired: `fired_count` counts the
        // fires so far, the same comparison `advance_after_fire` makes.
        EndMode::AfterCount { n } => next.filter(|_| r.fired_count < *n),
        EndMode::Never => next,
    };
    next.map(fmt_dt)
}

pub fn emit_changed(app: &AppHandle) {
    let _ = app.emit("reminders-changed", ());
}

/// Background loop: every TICK_SECS fire whatever is due.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(TICK_SECS)).await;
            if let Err(e) = tick(&app) {
                eprintln!("scheduler tick error: {e}");
            }
        }
    });
}

fn tick(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let now_s = fmt_dt(now_local());
    let due = {
        let conn = state.db_lock();
        db::due_reminders(&conn, &now_s)?
    };
    for r in &due {
        let next = advance_after_fire(r, r.next_due.as_deref().unwrap_or(&now_s));
        {
            let conn = state.db_lock();
            db::set_after_fire(&conn, &r.id, next, r.fired_count + 1)?;
        }
        open_popup(app, r);
    }
    if !due.is_empty() {
        crate::sound::play_reminder();
        emit_changed(app);
    }
    Ok(())
}

/// Show one popup window per reminder; reuse the existing window if present.
pub fn open_popup(app: &AppHandle, r: &Reminder) {
    let label = popup_label(&r.id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return;
    }
    build_popup_window(app, &label, &r.title);
}

fn build_popup_window(app: &AppHandle, label: &str, title: &str) {
    let position = {
        let state = app.state::<AppState>();
        state.settings_lock().popup_corner.clone()
    };
    // Index among currently open popups: each next one stacks like a card.
    let open_count = app
        .webview_windows()
        .keys()
        .filter(|l| l.starts_with(POPUP_PREFIX) || **l == MISSED_LABEL)
        .count();
    let (x, y) = popup_origin(app, &position, open_count);
    // Hidden from creation: the popup reveals itself via `popup_window_ready`
    // once its interface is rendered, so no blank WebView frame flashes.
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("popup.html".into()))
        .title(title)
        .inner_size(440.0, 310.0)
        .min_inner_size(340.0, 220.0)
        .resizable(true)
        .maximizable(false)
        .always_on_top(true)
        .focused(true)
        .visible(false);
    builder = builder.position(x, y);
    if let Err(e) = builder.build() {
        eprintln!("failed to open popup window '{label}': {e}");
        return;
    }
    // A fired reminder must not stay invisible if its page never loads.
    startup::fallback_reveal(app, label, startup::READY_FALLBACK);
}

/// Popup geometry: inner size plus room for the native title bar.
const POPUP_W: f64 = 440.0;
const POPUP_H: f64 = 342.0;
// ~24px so the VISIBLE gap stays ~16px: GetWindowRect includes the
// ~7px invisible resize border of the window.
const POPUP_MARGIN: f64 = 24.0;
/// Offset between stacked popups (card-deck style).
const STACK_STEP: f64 = 36.0;

/// Resolve the popup origin in logical px for the configured screen position.
/// The work area of the monitor under the cursor is used (falls back to the
/// primary monitor), so the taskbar is never covered. Each subsequent open
/// popup shifts aside like cards in a deck, without fully covering the rest.
fn popup_origin(app: &AppHandle, position: &str, index: usize) -> (f64, f64) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());

    let Some(m) = monitor else {
        // No monitor info available: cascade from the top-left.
        let k = (index % 6) as f64 * STACK_STEP;
        return (POPUP_MARGIN + k, POPUP_MARGIN + k);
    };

    let scale = m.scale_factor();
    let area = m.work_area();
    // Work area is in physical px, window positions in logical px.
    let x0 = f64::from(area.position.x) / scale;
    let y0 = f64::from(area.position.y) / scale;
    let w = f64::from(area.size.width) / scale;
    let h = f64::from(area.size.height) / scale;

    let k = (index % 6) as f64 * STACK_STEP;
    let cx = x0 + (w - POPUP_W) / 2.0; // horizontally centered origin
    let cy = y0 + (h - POPUP_H) / 2.0; // vertically centered origin
    let (x, y) = match position {
        "top-right" => (x0 + w - POPUP_W - POPUP_MARGIN - k, y0 + POPUP_MARGIN + k),
        "bottom-left" => (x0 + POPUP_MARGIN + k, y0 + h - POPUP_H - POPUP_MARGIN - k),
        "bottom-right" => (
            x0 + w - POPUP_W - POPUP_MARGIN - k,
            y0 + h - POPUP_H - POPUP_MARGIN - k,
        ),
        "center-top" => (cx, y0 + POPUP_MARGIN + k),
        "center-bottom" => (cx, y0 + h - POPUP_H - POPUP_MARGIN - k),
        "center-left" => (x0 + POPUP_MARGIN + k, cy),
        "center-right" => (x0 + w - POPUP_W - POPUP_MARGIN - k, cy),
        // The whole deck drifts slightly down-right so stacked popups stay
        // recognizable as separate windows.
        "center" => (cx + k, cy + k),
        // "top-left" and any unknown value.
        _ => (x0 + POPUP_MARGIN + k, y0 + POPUP_MARGIN + k),
    };
    (x.max(0.0), y.max(0.0))
}

/// On startup: fire everything that came due while the app was closed or the
/// PC asleep — collapsed into a single "missed reminders" list window.
pub fn startup_catchup(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = now_local();
    let now_s = fmt_dt(now);
    let due = {
        let conn = state.db_lock();
        match db::due_reminders(&conn, &now_s) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("catchup query error: {e}");
                return;
            }
        }
    };
    if due.is_empty() {
        return;
    }
    for r in &due {
        let next = advance_after_fire(r, r.next_due.as_deref().unwrap_or(&now_s));
        let conn = state.db_lock();
        if let Err(e) = db::set_after_fire(&conn, &r.id, next, r.fired_count + 1) {
            eprintln!("catchup update error: {e}");
        }
    }
    *state.missed_lock() = due;
    // Window title = the app's display name from tauri.conf.json.
    build_popup_window(app, MISSED_LABEL, &display_name(app));
    emit_changed(app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{EndMode, Priority, Recurrence};

    fn reminder(start_at: &str, rec: Recurrence, end: EndMode, fired: u32) -> Reminder {
        Reminder {
            id: "test".into(),
            title: "t".into(),
            note: String::new(),
            priority: Priority::Normal,
            start_at: start_at.into(),
            recurrence: rec,
            end_mode: end,
            fired_count: fired,
            next_due: None,
            enabled: true,
            completed: false,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn once_fire_completes() {
        let r = reminder("2026-10-11T09:00:00", Recurrence::Once, EndMode::Never, 0);
        assert_eq!(advance_after_fire(&r, "2026-10-11T09:00:00"), None);
    }

    #[test]
    fn daily_advances_from_fired_slot() {
        let r = reminder("2026-10-10T09:00:00", Recurrence::Daily, EndMode::Never, 1);
        // The fired slot is Oct 11 09:00 -> the next occurrence is Oct 12.
        // Snoozed off-grid firings (e.g. 09:05) still land on the 09:00 grid.
        assert_eq!(
            advance_after_fire(&r, "2026-10-11T09:00:00"),
            Some("2026-10-12T09:00:00".to_string())
        );
        assert_eq!(
            advance_after_fire(&r, "2026-10-11T09:05:00"),
            Some("2026-10-12T09:00:00".to_string())
        );
    }

    #[test]
    fn interval_keeps_grid_after_snooze() {
        let r = reminder(
            "2026-10-11T09:00:00",
            Recurrence::Interval {
                unit: crate::model::IntervalUnit::Minutes,
                n: 15,
            },
            EndMode::Never,
            1,
        );
        // Grid: 09:00, 09:15, ... Snoozed fire at 09:07 -> next grid point 09:15.
        assert_eq!(
            advance_after_fire(&r, "2026-10-11T09:07:00"),
            Some("2026-10-11T09:15:00".to_string())
        );
    }

    #[test]
    fn after_count_stops_at_limit() {
        let r = reminder(
            "2026-10-10T09:00:00",
            Recurrence::Daily,
            EndMode::AfterCount { n: 2 },
            1,
        );
        // This fire is occurrence #2 -> no next occurrence.
        assert_eq!(advance_after_fire(&r, "2026-10-11T09:00:00"), None);
        let r3 = reminder(
            "2026-10-10T09:00:00",
            Recurrence::Daily,
            EndMode::AfterCount { n: 3 },
            1,
        );
        assert_eq!(
            advance_after_fire(&r3, "2026-10-11T09:00:00"),
            Some("2026-10-12T09:00:00".to_string())
        );
    }

    #[test]
    fn until_date_excludes_later_occurrences() {
        // Until Oct 11 inclusive: the Oct 11 firing is the last one.
        let r = reminder(
            "2026-10-10T09:00:00",
            Recurrence::Daily,
            EndMode::Until {
                date: "2026-10-11".into(),
            },
            1,
        );
        assert_eq!(advance_after_fire(&r, "2026-10-11T09:00:00"), None);
        // Until Oct 12: after the Oct 11 firing the next slot (Oct 12) is allowed.
        let r2 = reminder(
            "2026-10-10T09:00:00",
            Recurrence::Daily,
            EndMode::Until {
                date: "2026-10-12".into(),
            },
            1,
        );
        assert_eq!(
            advance_after_fire(&r2, "2026-10-11T09:00:00"),
            Some("2026-10-12T09:00:00".to_string())
        );
    }

    #[test]
    fn initial_next_for_once_in_past_fires_immediately() {
        let r = reminder("2026-01-01T09:00:00", Recurrence::Once, EndMode::Never, 0);
        assert_eq!(
            initial_next_due(&r),
            Some("2026-01-01T09:00:00".to_string())
        );
    }

    #[test]
    fn until_bound_compares_calendar_dates() {
        let late = parse_dt("2026-10-11T23:30:00").unwrap();
        assert!(until_allows(late, "2026-10-11"));
        assert!(until_allows(late, "2026-10-12"));
        assert!(!until_allows(late, "2026-10-10"));
    }

    #[test]
    fn initial_next_respects_an_end_date_already_passed() {
        let now = now_local();
        let start = fmt_dt(now - chrono::Duration::days(10));
        let yesterday = fmt_dt(now - chrono::Duration::days(1));
        let r = reminder(
            &start,
            Recurrence::Daily,
            EndMode::Until {
                date: yesterday[..10].to_string(),
            },
            0,
        );
        // The next daily occurrence is today or tomorrow: past the end date,
        // so the rule must not fire at all instead of firing once more.
        assert_eq!(initial_next_due(&r), None);
    }

    #[test]
    fn initial_next_respects_an_end_date_still_ahead() {
        let now = now_local();
        let start = fmt_dt(now - chrono::Duration::days(10));
        let later = fmt_dt(now + chrono::Duration::days(10));
        let r = reminder(
            &start,
            Recurrence::Daily,
            EndMode::Until {
                date: later[..10].to_string(),
            },
            0,
        );
        let next = initial_next_due(&r).expect("the occurrence is inside the end date");
        assert!(next.as_str() > fmt_dt(now).as_str());
    }

    #[test]
    fn initial_next_end_date_boundary_is_inclusive() {
        let now = now_local();
        let start = fmt_dt(now + chrono::Duration::days(5));
        let on_the_day = reminder(
            &start,
            Recurrence::Daily,
            EndMode::Until {
                date: start[..10].to_string(),
            },
            0,
        );
        // The only occurrence lands exactly on the end date: it still counts.
        assert_eq!(
            initial_next_due(&on_the_day).as_deref(),
            Some(start.as_str())
        );
        let day_before = fmt_dt(now + chrono::Duration::days(4));
        let blocked = reminder(
            &start,
            Recurrence::Daily,
            EndMode::Until {
                date: day_before[..10].to_string(),
            },
            0,
        );
        assert_eq!(initial_next_due(&blocked), None);
    }

    #[test]
    fn initial_next_respects_a_used_up_repeat_count() {
        let now = now_local();
        let start = fmt_dt(now - chrono::Duration::days(10));
        // Three fires allowed and three already fired: the rule is spent.
        let spent = reminder(&start, Recurrence::Daily, EndMode::AfterCount { n: 3 }, 3);
        assert_eq!(initial_next_due(&spent), None);

        let one_left = reminder(&start, Recurrence::Daily, EndMode::AfterCount { n: 3 }, 2);
        let next = initial_next_due(&one_left).expect("one occurrence is still left");
        assert!(next.as_str() > fmt_dt(now).as_str());

        // A fresh single-fire rule has its one occurrence ahead of it.
        let fresh = reminder(&start, Recurrence::Daily, EndMode::AfterCount { n: 1 }, 0);
        assert!(initial_next_due(&fresh).is_some());
    }

    #[test]
    fn initial_next_disabled_or_completed_is_none() {
        let mut r = reminder("2030-01-01T09:00:00", Recurrence::Daily, EndMode::Never, 0);
        r.enabled = false;
        assert_eq!(initial_next_due(&r), None);
        r.enabled = true;
        r.completed = true;
        assert_eq!(initial_next_due(&r), None);
    }

    #[test]
    fn initial_next_daily_from_now() {
        let r = reminder("2020-01-01T09:00:00", Recurrence::Daily, EndMode::Never, 0);
        let next = initial_next_due(&r).unwrap();
        // Whatever today is, the result must be today (if 09:00 is ahead) or
        // tomorrow at 09:00 — never in the past.
        let now = now_local();
        let parsed = parse_dt(&next).unwrap();
        assert!(parsed > now);
        assert_eq!(parsed.format("%H:%M:%S").to_string(), "09:00:00");
    }
}
