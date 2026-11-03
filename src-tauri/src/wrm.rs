//! Import of Wise Reminder 2.x data files (*.wrm).
//!
//! The format is UTF-8 JSON: a `{ "schema", "appVersion", "deviceId",
//! "savedAt", "reminders": [...] }` envelope with PascalCase records.
//! Only what this app can represent is mapped; unknown fields are ignored
//! and records that fail to parse are skipped:
//! - `Date` (local midnight) + `Time` -> `start_at`;
//! - `Description` -> `note`;
//! - `Repeat`: Never -> once, Daily -> daily, Weekdays -> Mon..Fri,
//!   Weekly -> `SelectedWeekdays` (fallback: the start weekday),
//!   Monthly -> `SelectedMonthDays` (fallback: the start day),
//!   Quarterly -> every 3 months, BiWeekly -> every 2 weeks,
//!   Yearly -> month/day of `Date`, Custom -> `CustomInterval` x
//!   `CustomUnit`; anything else falls back to a one-shot reminder
//!   (same policy as the 1.x parser);
//! - `RepeatEnd`: OnDate -> until the date part of `RepeatEndDate` (the
//!   value may carry a UTC offset), AfterCount -> after `RepeatCount`;
//! - `Priority`: High -> high, everything else (None, Low, ...) -> normal;
//! - `IsCompleted` -> completed; `CreatedAt`/`UpdatedAt` are RFC3339 UTC
//!   instants converted to local wall-clock;
//! - `SelectedWeekdays` holds weekday numbers (Mon = 1) or English day
//!   names, comma/semicolon separated ("None" when unset).
//!
//! Unlike the 1.x *.dat format, a *.wrm record always stores its due
//! date, so everything imports enabled.

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, NaiveTime};
use serde::Deserialize;
use serde_json::Value;

use crate::model::{EndMode, IntervalUnit, Priority, Recurrence, Reminder, fmt_dt, now_local};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WrmRecord {
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    date: String,
    #[serde(default)]
    time: String,
    #[serde(default)]
    repeat: String,
    #[serde(default)]
    repeat_end: String,
    #[serde(default)]
    repeat_end_date: String,
    #[serde(default)]
    repeat_count: Option<u32>,
    #[serde(default)]
    custom_interval: u32,
    #[serde(default)]
    custom_unit: String,
    #[serde(default)]
    priority: String,
    #[serde(default)]
    selected_weekdays: String,
    #[serde(default)]
    selected_month_days: Vec<u8>,
    #[serde(default)]
    is_completed: bool,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
}

/// "YYYY-MM-DD..." -> the local date (the remainder is time/offset).
fn parse_local_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.get(..10)?, "%Y-%m-%d").ok()
}

fn parse_time(s: &str) -> Option<NaiveTime> {
    let s = s.trim();
    NaiveTime::parse_from_str(s, "%H:%M:%S%.f")
        .or_else(|_| NaiveTime::parse_from_str(s, "%H:%M:%S"))
        .or_else(|_| NaiveTime::parse_from_str(s, "%H:%M"))
        .ok()
}

/// RFC3339 UTC instant ("...Z" / with offset) -> local wall-clock string.
fn rfc3339_to_local(s: &str) -> Option<String> {
    let dt: DateTime<Local> = DateTime::parse_from_rfc3339(s).ok()?.into();
    Some(fmt_dt(dt.naive_local()))
}

/// Weekday numbers 1..=7, Monday = 1.
fn weekday_number(d: NaiveDate) -> u8 {
    d.weekday().num_days_from_monday() as u8 + 1
}

const DAY_NAMES: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/// SelectedWeekdays: "None", or numbers 1..=7 / English day names joined
/// with commas or semicolons. Unrecognized tokens are ignored.
fn weekdays_from_str(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for token in s.split([',', ';', ' ']) {
        let t = token.trim();
        if t.is_empty() || t.eq_ignore_ascii_case("none") {
            continue;
        }
        if let Ok(n) = t.parse::<u8>() {
            if (1..=7).contains(&n) {
                out.push(n);
            }
            continue;
        }
        let low = t.to_ascii_lowercase();
        if let Some(i) = DAY_NAMES.iter().position(|d| low.starts_with(d)) {
            out.push(i as u8 + 1);
        }
    }
    out
}

fn interval_unit(s: &str) -> IntervalUnit {
    match s.trim().to_ascii_lowercase().as_str() {
        "minute" | "minutes" => IntervalUnit::Minutes,
        "hour" | "hours" => IntervalUnit::Hours,
        "week" | "weeks" => IntervalUnit::Weeks,
        "month" | "months" => IntervalUnit::Months,
        "year" | "years" => IntervalUnit::Years,
        // "Day" and anything unrecognized.
        _ => IntervalUnit::Days,
    }
}

fn map_repeat(w: &WrmRecord, start: NaiveDateTime) -> Recurrence {
    let day = start.date();
    match w.repeat.trim().to_ascii_lowercase().as_str() {
        "hourly" => Recurrence::Interval {
            unit: IntervalUnit::Hours,
            n: 1,
        },
        "daily" => Recurrence::Daily,
        "weekdays" => Recurrence::Weekly {
            weekdays: vec![1, 2, 3, 4, 5],
        },
        // The other end of the week, mirroring "Weekdays".
        "weekends" => Recurrence::Weekly {
            weekdays: vec![6, 7],
        },
        "weekly" => {
            let mut weekdays = weekdays_from_str(&w.selected_weekdays);
            if weekdays.is_empty() {
                weekdays.push(weekday_number(day));
            }
            Recurrence::Weekly { weekdays }
        }
        "monthly" => {
            let mut days: Vec<u8> = w
                .selected_month_days
                .iter()
                .copied()
                .filter(|d| (1..=31).contains(d))
                .collect();
            if days.is_empty() {
                days.push(day.day() as u8);
            }
            Recurrence::Monthly { days }
        }
        "quarterly" => Recurrence::Interval {
            unit: IntervalUnit::Months,
            n: 3,
        },
        "semiannually" | "semi-annually" => Recurrence::Interval {
            unit: IntervalUnit::Months,
            n: 6,
        },
        "biweekly" | "bi-weekly" => Recurrence::Interval {
            unit: IntervalUnit::Weeks,
            n: 2,
        },
        "yearly" => Recurrence::Yearly {
            month: day.month() as u8,
            day: day.day() as u8,
        },
        "custom" => Recurrence::Interval {
            unit: interval_unit(&w.custom_unit),
            n: w.custom_interval.max(1),
        },
        // "Never" and unknown codes behave as one-shot reminders.
        _ => Recurrence::Once,
    }
}

fn map_end(w: &WrmRecord) -> EndMode {
    match w.repeat_end.trim().to_ascii_lowercase().as_str() {
        "ondate" => {
            let date = w.repeat_end_date.get(..10).and_then(parse_local_date);
            match date {
                Some(d) => EndMode::Until {
                    date: d.format("%Y-%m-%d").to_string(),
                },
                None => EndMode::Never,
            }
        }
        "aftercount" => EndMode::AfterCount {
            n: w.repeat_count.unwrap_or(1).max(1),
        },
        _ => EndMode::Never,
    }
}

impl WrmRecord {
    fn to_reminder(&self) -> Option<Reminder> {
        let date = parse_local_date(&self.date)?;
        let time = parse_time(&self.time).unwrap_or(NaiveTime::MIN);
        let start = date.and_time(time);
        Some(Reminder {
            id: String::new(),
            title: self.title.clone(),
            note: self.description.trim().to_string(),
            priority: if self.priority.trim().eq_ignore_ascii_case("high") {
                Priority::High
            } else {
                Priority::Normal
            },
            start_at: fmt_dt(start),
            recurrence: map_repeat(self, start),
            end_mode: map_end(self),
            fired_count: 0,
            next_due: None,
            enabled: true,
            completed: self.is_completed,
            created_at: rfc3339_to_local(&self.created_at).unwrap_or_else(|| fmt_dt(now_local())),
            updated_at: rfc3339_to_local(&self.updated_at).unwrap_or_else(|| fmt_dt(now_local())),
        })
    }
}

/// Parse the text of a Wise Reminder 2.x .wrm file.
pub fn parse_wrm(text: &str) -> Result<Vec<Reminder>, String> {
    let text = text.trim_start_matches('\u{feff}');
    let value: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let array = value
        .get("reminders")
        .and_then(Value::as_array)
        .ok_or("no reminders array in file")?;
    let mut out = Vec::new();
    for item in array {
        let Ok(w) = serde_json::from_value::<WrmRecord>(item.clone()) else {
            continue;
        };
        let Some(mut reminder) = w.to_reminder() else {
            continue;
        };
        crate::db::sanitize(&mut reminder);
        if !reminder.completed && reminder.enabled {
            reminder.next_due = crate::scheduler::initial_next_due(&reminder);
        }
        out.push(reminder);
    }
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::IntervalUnit;

    #[test]
    fn weekdays_parse_numbers_and_names() {
        assert_eq!(weekdays_from_str("None"), Vec::<u8>::new());
        assert_eq!(weekdays_from_str(""), Vec::<u8>::new());
        assert_eq!(weekdays_from_str("Monday,Friday"), vec![1, 5]);
        assert_eq!(weekdays_from_str("1, 5"), vec![1, 5]);
        assert_eq!(weekdays_from_str("tue;sunday"), vec![2, 7]);
        assert_eq!(weekdays_from_str("garbage,9,0"), Vec::<u8>::new());
    }

    #[test]
    fn custom_units_map_to_intervals() {
        assert_eq!(interval_unit("Day"), IntervalUnit::Days);
        assert_eq!(interval_unit("Week"), IntervalUnit::Weeks);
        assert_eq!(interval_unit("Month"), IntervalUnit::Months);
        assert_eq!(interval_unit("Year"), IntervalUnit::Years);
        assert_eq!(interval_unit("Hour"), IntervalUnit::Hours);
        assert_eq!(interval_unit("Minute"), IntervalUnit::Minutes);
        assert_eq!(interval_unit("decade"), IntervalUnit::Days);
    }

    #[test]
    fn hourly_weekends_semiannually_have_dedicated_mappings() {
        let json = r#"{"reminders":[
            {"Title":"Hourly","Date":"2026-10-11T00:00:00","Time":"21:00:00","Repeat":"Hourly"},
            {"Title":"Hourly lowercase","Date":"2026-10-11T00:00:00","Time":"21:00:00","Repeat":"hourly"},
            {"Title":"Weekends","Date":"2026-10-17T00:00:00","Time":"10:00:00","Repeat":"Weekends"},
            {"Title":"SemiAnnually","Date":"2026-10-12T00:00:00","Time":"07:45:00","Repeat":"SemiAnnually"},
            {"Title":"Semi-Annually","Date":"2026-10-12T00:00:00","Time":"07:45:00","Repeat":"Semi-Annually"},
            {"Title":"Fortnightly","Date":"2026-10-12T00:00:00","Time":"07:45:00","Repeat":"Fortnightly"}
        ]}"#;
        let list = parse_wrm(json).unwrap();
        let by = |t: &str| list.iter().find(|r| r.title == t).unwrap();

        let hourly = Recurrence::Interval {
            unit: IntervalUnit::Hours,
            n: 1,
        };
        let semi_annually = Recurrence::Interval {
            unit: IntervalUnit::Months,
            n: 6,
        };
        assert_eq!(by("Hourly").recurrence, hourly);
        // Codes are matched case-insensitively.
        assert_eq!(by("Hourly lowercase").recurrence, hourly);
        assert_eq!(
            by("Weekends").recurrence,
            Recurrence::Weekly {
                weekdays: vec![6, 7]
            }
        );
        assert_eq!(by("SemiAnnually").recurrence, semi_annually);
        assert_eq!(by("Semi-Annually").recurrence, semi_annually);
        // Unknown codes still fall back to a one-shot reminder.
        assert_eq!(by("Fortnightly").recurrence, Recurrence::Once);
    }

    #[test]
    fn priority_maps_high_only() {
        let json = r#"{"reminders":[
            {"Title":"A","Date":"2026-10-11T00:00:00","Time":"08:00:00","Repeat":"Never","RepeatEnd":"Never","Priority":"High"},
            {"Title":"B","Date":"2026-10-11T00:00:00","Time":"08:00:00","Repeat":"Never","RepeatEnd":"Never","Priority":"Low"},
            {"Title":"C","Date":"2026-10-11T00:00:00","Time":"08:00:00","Repeat":"Never","RepeatEnd":"Never"}
        ]}"#;
        let list = parse_wrm(json).unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].priority, Priority::High);
        assert_eq!(list[1].priority, Priority::Normal);
        assert_eq!(list[2].priority, Priority::Normal);
    }

    #[test]
    fn invalid_dates_skip_records() {
        let json = r#"{"reminders":[
            {"Title":"Broken","Date":"not-a-date","Time":"08:00:00"},
            {"Title":"Fine","Date":"2026-10-11T00:00:00","Time":"08:00:00"}
        ]}"#;
        let list = parse_wrm(json).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Fine");
    }

    /// End-to-end check against the bundled fixture: a real Wise Reminder
    /// 2.x export covering every repeat mode the editor can produce, both
    /// end-repeat modes it offers (Never / On Date — the UI has no
    /// after-N-occurrences option), all four priorities, notes present and
    /// absent, and one completed record. Titles are neutral ASCII labels.
    #[test]
    fn parses_bundled_wrm_fixture() {
        let list = parse_wrm(include_str!("testdata/wise-sample.wrm")).unwrap();
        assert_eq!(list.len(), 14);
        // Records are returned sorted by CreatedAt, which matches the 01..14
        // numbering they were authored in.
        assert_eq!(list.first().unwrap().title, "01 Never no-note");
        assert_eq!(list.last().unwrap().title, "14 Completed medium");
        let by = |t: &str| list.iter().find(|r| r.title == t).unwrap();

        // Date + Time compose start_at; an empty Description stays empty.
        let never = by("01 Never no-note");
        assert_eq!(never.recurrence, Recurrence::Once);
        assert_eq!(never.start_at, "2026-10-11T20:30:00");
        assert_eq!(never.note, "");
        assert_eq!(never.end_mode, EndMode::Never);
        assert!(never.enabled && !never.completed);
        // CreatedAt is an RFC3339 UTC instant converted to local wall-clock.
        let created = DateTime::parse_from_rfc3339("2026-10-11T14:53:26.4332751Z")
            .unwrap()
            .with_timezone(&Local);
        assert_eq!(never.created_at, fmt_dt(created.naive_local()));

        // Daily keeps its note; Low priority has no dedicated mapping yet.
        let daily = by("03 Daily with note");
        assert_eq!(daily.recurrence, Recurrence::Daily);
        assert_eq!(daily.note, "Drink water after wake-up");
        assert_eq!(daily.priority, Priority::Normal);

        // "Weekdays" means Mon..Fri.
        assert_eq!(
            by("04 Weekdays silent").recurrence,
            Recurrence::Weekly {
                weekdays: vec![1, 2, 3, 4, 5]
            }
        );

        // Weekly with explicit SelectedWeekdays names (Mon/Wed/Fri).
        assert_eq!(
            by("06 Weekly MWF note").recurrence,
            Recurrence::Weekly {
                weekdays: vec![1, 3, 5]
            }
        );

        assert_eq!(
            by("07 Bi-weekly chime").recurrence,
            Recurrence::Interval {
                unit: IntervalUnit::Weeks,
                n: 2
            }
        );

        // Monthly carries every selected day of the month.
        assert_eq!(
            by("08 Monthly 1+15").recurrence,
            Recurrence::Monthly { days: vec![1, 15] }
        );

        // Quarterly -> every 3 months, with an On Date end bound.
        let quarterly = by("09 Every 3 months until");
        assert_eq!(
            quarterly.recurrence,
            Recurrence::Interval {
                unit: IntervalUnit::Months,
                n: 3
            }
        );
        assert_eq!(
            quarterly.end_mode,
            EndMode::Until {
                date: "2027-03-01".into()
            }
        );

        // Yearly takes month/day from Date; only "High" maps to high.
        let yearly = by("11 Yearly high note");
        assert_eq!(yearly.recurrence, Recurrence::Yearly { month: 12, day: 31 });
        assert_eq!(yearly.priority, Priority::High);
        assert_eq!(yearly.note, "Prepare New Year gifts");

        // Custom N weeks / N days map straight onto Interval; the day one
        // also carries an On Date end bound.
        assert_eq!(
            by("12 Custom 2 weeks").recurrence,
            Recurrence::Interval {
                unit: IntervalUnit::Weeks,
                n: 2
            }
        );
        let custom_days = by("13 Custom 3 days until");
        assert_eq!(
            custom_days.recurrence,
            Recurrence::Interval {
                unit: IntervalUnit::Days,
                n: 3
            }
        );
        assert_eq!(
            custom_days.end_mode,
            EndMode::Until {
                date: "2026-11-01".into()
            }
        );

        // Completed records import as completed with no next occurrence;
        // "Medium" has no dedicated mapping yet, so it lands on Normal.
        let done = by("14 Completed medium");
        assert!(done.completed);
        assert_eq!(done.next_due, None);
        assert_eq!(done.priority, Priority::Normal);

        // Hourly -> every hour, keeping its On Date end bound.
        let hourly = by("02 Hourly until date");
        assert_eq!(
            hourly.recurrence,
            Recurrence::Interval {
                unit: IntervalUnit::Hours,
                n: 1
            }
        );
        assert_eq!(
            hourly.end_mode,
            EndMode::Until {
                date: "2026-10-12".into()
            }
        );

        // Weekends is the mirror of Weekdays: Saturday + Sunday.
        assert_eq!(
            by("05 Weekends").recurrence,
            Recurrence::Weekly {
                weekdays: vec![6, 7]
            }
        );

        // SemiAnnually -> every 6 months, as Quarterly -> every 3 months.
        assert_eq!(
            by("10 Every 6 months").recurrence,
            Recurrence::Interval {
                unit: IntervalUnit::Months,
                n: 6
            }
        );
    }
}
