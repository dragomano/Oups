use std::path::Path;

use chrono::NaiveDateTime;
use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::model::{EndMode, Priority, Recurrence, Reminder, fmt_dt, now_local, parse_dt};

pub fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "busy_timeout", 5000)
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            priority INTEGER NOT NULL DEFAULT 0,
            start_at TEXT NOT NULL,
            recurrence TEXT NOT NULL,
            end_mode TEXT NOT NULL,
            fired_count INTEGER NOT NULL DEFAULT 0,
            next_due TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(enabled, completed, next_due);
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Older builds stored monthly recurrences as {"type":"monthly","day":N};
/// the current model uses a day list. Convert on read so existing rows
/// keep working without a schema migration.
pub fn normalize_recurrence_json(json: &str) -> String {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(json) else {
        return json.to_string();
    };
    let Some(obj) = value.as_object_mut() else {
        return json.to_string();
    };
    if obj.get("type").and_then(|t| t.as_str()) == Some("monthly")
        && !obj.contains_key("days")
        && let Some(day) = obj.get("day").and_then(|d| d.as_u64())
    {
        obj.insert("days".into(), serde_json::json!([day]));
    }
    value.to_string()
}

fn row_to_reminder(row: &Row) -> rusqlite::Result<Reminder> {
    let recurrence_json: String = row.get("recurrence")?;
    let end_mode_json: String = row.get("end_mode")?;
    Ok(Reminder {
        id: row.get("id")?,
        title: row.get("title")?,
        note: row.get("note")?,
        priority: Priority::from_int(row.get::<_, i64>("priority")?),
        start_at: row.get("start_at")?,
        recurrence: serde_json::from_str(&normalize_recurrence_json(&recurrence_json))
            .unwrap_or(Recurrence::Once),
        end_mode: serde_json::from_str(&end_mode_json).unwrap_or(EndMode::Never),
        fired_count: row.get::<_, i64>("fired_count")? as u32,
        next_due: row.get("next_due")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        completed: row.get::<_, i64>("completed")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

const COLS: &str = "id, title, note, priority, start_at, recurrence, end_mode, fired_count, next_due, enabled, completed, created_at, updated_at";

pub fn all_reminders(conn: &Connection) -> Result<Vec<Reminder>, String> {
    let sql = format!("SELECT {COLS} FROM reminders ORDER BY next_due IS NULL, next_due, start_at");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_reminder)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn get_reminder(conn: &Connection, id: &str) -> Result<Option<Reminder>, String> {
    let sql = format!("SELECT {COLS} FROM reminders WHERE id = ?1");
    conn.query_row(&sql, params![id], row_to_reminder)
        .optional()
        .map_err(|e| e.to_string())
}

/// Reminders whose `next_due` has passed (fixed-width local timestamps,
/// so lexicographic order equals chronological order).
pub fn due_reminders(conn: &Connection, now: &str) -> Result<Vec<Reminder>, String> {
    let sql = format!(
        "SELECT {COLS} FROM reminders WHERE enabled = 1 AND completed = 0 AND next_due IS NOT NULL AND next_due <= ?1"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![now], row_to_reminder)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn upsert_reminder(conn: &Connection, r: &Reminder) -> Result<(), String> {
    let recurrence = serde_json::to_string(&r.recurrence).map_err(|e| e.to_string())?;
    let end_mode = serde_json::to_string(&r.end_mode).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO reminders (id, title, note, priority, start_at, recurrence, end_mode, fired_count, next_due, enabled, completed, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            note = excluded.note,
            priority = excluded.priority,
            start_at = excluded.start_at,
            recurrence = excluded.recurrence,
            end_mode = excluded.end_mode,
            next_due = excluded.next_due,
            enabled = excluded.enabled,
            completed = excluded.completed,
            updated_at = excluded.updated_at",
        params![
            r.id,
            r.title,
            r.note,
            r.priority.to_int(),
            r.start_at,
            recurrence,
            end_mode,
            r.fired_count as i64,
            r.next_due,
            r.enabled as i64,
            r.completed as i64,
            r.created_at,
            r.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_reminder(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM reminders WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Called right after an occurrence fired: store the next occurrence and,
/// when the rule is exhausted, mark the reminder completed.
pub fn set_after_fire(
    conn: &Connection,
    id: &str,
    next_due: Option<String>,
    fired_count: u32,
) -> Result<(), String> {
    let completed: i64 = if next_due.is_some() { 0 } else { 1 };
    conn.execute(
        "UPDATE reminders SET next_due = ?2, fired_count = ?3, completed = ?4 WHERE id = ?1",
        params![id, next_due, fired_count as i64, completed],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_next_due(conn: &Connection, id: &str, next_due: Option<String>) -> Result<(), String> {
    conn.execute(
        "UPDATE reminders SET next_due = ?2 WHERE id = ?1",
        params![id, next_due],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE reminders SET enabled = ?2 WHERE id = ?1",
        params![id, enabled as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_completed(conn: &Connection, id: &str, completed: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE reminders SET completed = ?2 WHERE id = ?1",
        params![id, completed as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sanity clamp for values that come from the UI or imported files.
pub fn sanitize(r: &mut Reminder) {
    sanitize_at(r, now_local());
}

/// Keep generated timestamps consistent with the supplied operation time.
pub(crate) fn sanitize_at(r: &mut Reminder, now: NaiveDateTime) {
    if r.id.is_empty() {
        r.id = uuid::Uuid::new_v4().to_string();
    }
    if r.created_at.is_empty() {
        r.created_at = fmt_dt(now);
    }
    r.updated_at = fmt_dt(now);
    if let Recurrence::Monthly { days } = &mut r.recurrence {
        days.retain(|d| (1..=31).contains(d));
        days.sort_unstable();
        days.dedup();
        if days.is_empty() {
            days.push(1);
        }
    }
    if let Recurrence::Yearly { month, day } = &mut r.recurrence {
        *month = (*month).clamp(1, 12);
        *day = (*day).clamp(1, 31);
    }
    if let Recurrence::Interval { n, .. } = &mut r.recurrence {
        *n = (*n).max(1);
    }
    if let Recurrence::Weekly { weekdays } = &mut r.recurrence {
        weekdays.retain(|w| (1..=7).contains(w));
        weekdays.sort_unstable();
        weekdays.dedup();
    }
    if let EndMode::AfterCount { n } = &mut r.end_mode {
        *n = (*n).max(1);
    }
    if r.start_at.is_empty() || parse_dt(&r.start_at).is_none() {
        r.start_at = fmt_dt(now);
    }
    r.title = r.title.trim().to_string();
    if r.title.is_empty() {
        r.title = "…".into();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_uses_supplied_time_for_generated_timestamps() {
        let mut reminder: Reminder =
            serde_json::from_str(r#"{"title":"Test","startAt":"invalid"}"#).unwrap();
        let now = parse_dt("2032-02-29T23:59:59").unwrap();
        sanitize_at(&mut reminder, now);
        assert_eq!(reminder.created_at, "2032-02-29T23:59:59");
        assert_eq!(reminder.updated_at, "2032-02-29T23:59:59");
        assert_eq!(reminder.start_at, "2032-02-29T23:59:59");

        let later = parse_dt("2032-03-01T00:00:00").unwrap();
        sanitize_at(&mut reminder, later);
        assert_eq!(reminder.created_at, "2032-02-29T23:59:59");
        assert_eq!(reminder.updated_at, "2032-03-01T00:00:00");
        assert_eq!(reminder.start_at, "2032-02-29T23:59:59");
    }

    #[test]
    fn legacy_monthly_json_is_upgraded() {
        let upgraded = serde_json::from_str::<serde_json::Value>(&normalize_recurrence_json(
            "{\"type\":\"monthly\",\"day\":15}",
        ))
        .unwrap();
        assert_eq!(upgraded["days"], serde_json::json!([15]));
        assert_eq!(upgraded["type"], "monthly");
        // Already-new shape keeps its semantics (key order is normalized).
        let same = normalize_recurrence_json("{\"type\":\"monthly\",\"days\":[1,15]}");
        let same = serde_json::from_str::<serde_json::Value>(&same).unwrap();
        assert_eq!(same["days"], serde_json::json!([1, 15]));
        // Broken JSON is returned as-is (row falls back to Recurrence::Once).
        assert_eq!(normalize_recurrence_json("not json"), "not json");
    }
}
