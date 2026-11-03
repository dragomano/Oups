use chrono::{DateTime, Local, NaiveDateTime};
use serde::{Deserialize, Serialize};

pub const DT_FORMAT: &str = "%Y-%m-%dT%H:%M:%S";

pub fn now_local() -> NaiveDateTime {
    let dt: DateTime<Local> = Local::now();
    dt.naive_local()
}

pub fn fmt_dt(dt: NaiveDateTime) -> String {
    dt.format(DT_FORMAT).to_string()
}

pub fn parse_dt(s: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s, DT_FORMAT).ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    #[default]
    Normal,
    High,
    Critical,
}

impl Priority {
    /// Stored as INTEGER. `Normal`/`High` keep the codes the two original
    /// levels used, and `Low`/`Critical` extend the range outwards, so
    /// databases written by older builds keep their meaning untouched.
    pub fn to_int(self) -> i64 {
        match self {
            Priority::Low => -1,
            Priority::Normal => 0,
            Priority::High => 1,
            Priority::Critical => 2,
        }
    }
    pub fn from_int(v: i64) -> Self {
        if v < 0 {
            Priority::Low
        } else if v == 0 {
            Priority::Normal
        } else if v == 1 {
            Priority::High
        } else {
            Priority::Critical
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum IntervalUnit {
    #[default]
    Minutes,
    Hours,
    Days,
    Weeks,
    Months,
    Years,
}

// The list-shaped variants (weekdays/days) make some variants larger than
// the unit ones; the enum lives in config objects, so the memory cost is
// irrelevant — boxing would only complicate matching.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[derive(Default)]
pub enum Recurrence {
    #[default]
    Once,
    Daily,
    /// Weekday numbers 1..=7, Monday = 1.
    Weekly {
        #[serde(default)]
        weekdays: Vec<u8>,
    },
    /// Selected days of month 1..=31, clamped to the last day of shorter
    /// months. Multiple days fire within the same month.
    Monthly {
        #[serde(default = "d1_days")]
        days: Vec<u8>,
    },
    /// Month 1..=12 and day 1..=31; Feb 29 falls back to Feb 28.
    Yearly {
        #[serde(default = "d1")]
        month: u8,
        #[serde(default = "d1")]
        day: u8,
    },
    Interval {
        #[serde(default)]
        unit: IntervalUnit,
        #[serde(default = "d1u")]
        n: u32,
    },
}

fn d1() -> u8 {
    1
}

fn d1u() -> u32 {
    1
}

fn d1_days() -> Vec<u8> {
    vec![1]
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EndMode {
    #[default]
    Never,
    AfterCount {
        #[serde(default = "d1u")]
        n: u32,
    },
    /// Inclusive local date "YYYY-MM-DD".
    Until {
        #[serde(default)]
        date: String,
    },
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    #[serde(default)]
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub priority: Priority,
    /// Local time of the first occurrence, "YYYY-MM-DDTHH:MM:SS".
    pub start_at: String,
    #[serde(default)]
    pub recurrence: Recurrence,
    #[serde(default)]
    pub end_mode: EndMode,
    #[serde(default)]
    pub fired_count: u32,
    #[serde(default)]
    pub next_due: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_int_round_trip() {
        for p in [
            Priority::Low,
            Priority::Normal,
            Priority::High,
            Priority::Critical,
        ] {
            assert_eq!(Priority::from_int(p.to_int()), p);
        }
    }

    #[test]
    fn priority_keeps_legacy_codes() {
        // 0 and 1 are what builds without Low/Critical wrote.
        assert_eq!(Priority::from_int(0), Priority::Normal);
        assert_eq!(Priority::from_int(1), Priority::High);
    }

    #[test]
    fn priority_out_of_range_clamps() {
        assert_eq!(Priority::from_int(-7), Priority::Low);
        assert_eq!(Priority::from_int(42), Priority::Critical);
    }

    #[test]
    fn priority_serializes_lowercase() {
        let json = serde_json::to_string(&Priority::Critical).unwrap();
        assert_eq!(json, "\"critical\"");
        assert_eq!(
            serde_json::from_str::<Priority>("\"low\"").unwrap(),
            Priority::Low
        );
        // A missing field in an imported record still yields the default.
        assert_eq!(Priority::default(), Priority::Normal);
    }
}
