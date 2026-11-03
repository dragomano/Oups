use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::{locale, modal_window, model::Reminder, state::AppState};

const LABEL: &str = "editor";

#[derive(Default)]
pub struct Draft(Mutex<Option<Reminder>>);

fn prepare_draft(
    mut reminder: Option<Reminder>,
    duplicate: bool,
    suffix: &str,
) -> Option<Reminder> {
    if duplicate && let Some(r) = &mut reminder {
        r.id.clear();
        r.title = format!("{} {suffix}", r.title);
        r.completed = false;
        r.enabled = true;
        r.fired_count = 0;
        r.next_due = None;
        r.created_at.clear();
        r.updated_at.clear();
    }
    reminder
}

#[tauri::command]
pub async fn open_editor(
    app: AppHandle,
    reminder: Option<Reminder>,
    duplicate: bool,
) -> Result<(), String> {
    // Keep an existing draft intact when another edit action is requested.
    if modal_window::focus_existing(&app)? {
        return Ok(());
    }
    let language = app.state::<AppState>().settings_lock().language.clone();
    let dict = locale::load_dict(&language);
    let reminder = prepare_draft(reminder, duplicate, &locale::tr(&dict, "list.copy_suffix"));
    let key = if reminder.as_ref().is_none_or(|r| r.id.is_empty()) {
        "editor.new_title"
    } else {
        "editor.edit_title"
    };
    *app.state::<Draft>()
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner()) = reminder;

    modal_window::open(&app, LABEL, "editor.html", &locale::tr(&dict, key))
}

#[tauri::command]
pub fn get_editor_reminder(state: State<'_, Draft>) -> Option<Reminder> {
    state.0.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

#[tauri::command]
pub fn fit_editor_window(app: AppHandle, height: f64) -> Result<(), String> {
    modal_window::fit(&app, LABEL, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicates_preserve_content_and_reset_identity_and_progress() {
        let reminder: Reminder = serde_json::from_value(serde_json::json!({
            "id":"original", "title":"Task", "note":"Note", "priority":"critical",
            "startAt":"2026-10-05T08:00:00", "recurrence":{"type":"monthly","days":[5,20]},
            "endMode":{"type":"afterCount","n":10}, "firedCount":7, "enabled":false,
            "completed":true, "nextDue":"2026-11-05T08:00:00", "createdAt":"2026-01-01T00:00:00", "updatedAt":"2026-10-01T00:00:00"
        })).unwrap();
        let copy = prepare_draft(Some(reminder.clone()), true, "(copy)").unwrap();
        assert!(copy.id.is_empty() && copy.created_at.is_empty() && copy.updated_at.is_empty());
        assert_eq!(copy.title, "Task (copy)");
        assert_eq!(copy.note, reminder.note);
        assert_eq!(copy.priority, reminder.priority);
        assert_eq!(copy.start_at, reminder.start_at);
        assert_eq!(copy.recurrence, reminder.recurrence);
        assert_eq!(copy.end_mode, reminder.end_mode);
        assert!(copy.enabled && !copy.completed && copy.next_due.is_none());
        assert_eq!(copy.fired_count, 0);
        let original = prepare_draft(Some(reminder), false, "(copy)").unwrap();
        assert_eq!(original.id, "original");
        assert!(original.completed && !original.enabled);
        assert_eq!(original.fired_count, 7);
        assert!(prepare_draft(None, true, "(copy)").is_none());
    }
}
