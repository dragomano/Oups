//! Validated snooze intervals, calculated from local wall-clock time.

use chrono::{Duration, Months, NaiveDateTime};
use serde::Deserialize;

const MIN_COUNT: u32 = 1;
const MAX_COUNT: u32 = 9999;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnoozeUnit {
    Minutes,
    Hours,
    Days,
    Weeks,
    Months,
}

pub fn due_at(now: NaiveDateTime, count: u32, unit: SnoozeUnit) -> Result<NaiveDateTime, String> {
    if !(MIN_COUNT..=MAX_COUNT).contains(&count) {
        return Err(format!(
            "snooze count must be between {MIN_COUNT} and {MAX_COUNT}"
        ));
    }

    // Calendar months preserve the time and clamp the day to the target month.
    let next = match unit {
        SnoozeUnit::Minutes => now.checked_add_signed(Duration::minutes(i64::from(count))),
        SnoozeUnit::Hours => now.checked_add_signed(Duration::hours(i64::from(count))),
        SnoozeUnit::Days => now.checked_add_signed(Duration::days(i64::from(count))),
        SnoozeUnit::Weeks => now.checked_add_signed(Duration::weeks(i64::from(count))),
        SnoozeUnit::Months => now.checked_add_months(Months::new(count)),
    };

    next.ok_or_else(|| "snooze date is out of range".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_dt;

    fn at(stamp: &str) -> NaiveDateTime {
        parse_dt(stamp).unwrap()
    }

    #[test]
    fn offsets_start_at_now_and_preserve_seconds() {
        let now = at("2026-11-07T23:58:45");
        for (count, unit, expected) in [
            (5, SnoozeUnit::Minutes, "2026-11-08T00:03:45"),
            (2, SnoozeUnit::Hours, "2026-11-08T01:58:45"),
            (2, SnoozeUnit::Days, "2026-11-09T23:58:45"),
            (2, SnoozeUnit::Weeks, "2026-11-21T23:58:45"),
            (2, SnoozeUnit::Months, "2027-01-07T23:58:45"),
        ] {
            assert_eq!(due_at(now, count, unit), Ok(at(expected)));
        }
    }

    #[test]
    fn calendar_months_clamp_days_instead_of_using_thirty_day_blocks() {
        for (now, count, expected) in [
            ("2027-01-31T09:15:30", 1, "2027-02-28T09:15:30"),
            ("2028-01-31T09:15:30", 1, "2028-02-29T09:15:30"),
            ("2028-02-29T09:15:30", 12, "2029-02-28T09:15:30"),
            ("2027-01-31T09:15:30", 2, "2027-03-31T09:15:30"),
        ] {
            assert_eq!(due_at(at(now), count, SnoozeUnit::Months), Ok(at(expected)));
        }
    }

    #[test]
    fn accepts_both_bounds_for_every_unit_and_rejects_counts_outside_them() {
        let now = at("2026-11-07T12:00:00");
        for unit in [
            SnoozeUnit::Minutes,
            SnoozeUnit::Hours,
            SnoozeUnit::Days,
            SnoozeUnit::Weeks,
            SnoozeUnit::Months,
        ] {
            assert!(due_at(now, 1, unit).unwrap() > now);
            assert!(due_at(now, 9999, unit).unwrap() > now);
            for invalid in [0, 10000, u32::MAX] {
                assert!(due_at(now, invalid, unit).is_err());
            }
        }
    }

    #[test]
    fn reports_date_overflow_without_panicking() {
        assert!(due_at(NaiveDateTime::MAX, 1, SnoozeUnit::Minutes).is_err());
        assert!(due_at(NaiveDateTime::MAX, 1, SnoozeUnit::Months).is_err());
    }

    #[test]
    fn accepts_only_the_five_supported_unit_names() {
        for unit in ["minutes", "hours", "days", "weeks", "months"] {
            assert!(serde_json::from_value::<SnoozeUnit>(serde_json::json!(unit)).is_ok());
        }
        for invalid in ["years", "month", ""] {
            assert!(serde_json::from_value::<SnoozeUnit>(serde_json::json!(invalid)).is_err());
        }
    }
}
