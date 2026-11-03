//! Import of Wise Reminder data files (*.dat).
//!
//! The format is an INI-like text file encoded in CP1251:
//! - `[UNFINISHED]` / `[FINISHED]` sections contain `R<YYYYMMDDHHMMSS>=<title>`
//!   lines (the R-key is the creation timestamp);
//! - one `[R<YYYYMMDDHHMMSS>]` section per reminder with fields:
//!   `PERIOD` (repeat code), `LASTTIME` / `CREATEDATETIME` / `ENDTIME`
//!   (Delphi TDateTime, "days,frac" — days since 1899-12-30, with a comma as
//!   the decimal separator) and `REPEAT_DATA` (hex-encoded rule bytes).
//!
//! PERIOD codes mirror the editor's Repeat dropdown (Once/Daily/Weekly/
//! Monthly/Yearly): 0 = once, 1 = daily, 2 = weekly, 3 = monthly,
//! 4 = yearly; anything else falls back to a one-shot reminder.
//! REPEAT_DATA is a hex-encoded byte blob whose layout depends on PERIOD:
//! - bytes 7..15 hold a little-endian DOUBLE = TDateTime (midnight) of the
//!   scheduled date — present for one-shot and yearly records;
//! - monthly: a byte equal to 0x01 at index i selects day i+1 of the month;
//! - weekly: a byte equal to 0x01 at index i (0..=6, Sunday-first) selects a
//!   weekday — index 0 = Sunday, 1 = Monday, … 6 = Saturday (the bytes past
//!   index 6 hold an unrelated internal time string). An empty set falls
//!   back to the start date's weekday.
//!
//! WAKETIME holds the scheduled TIME of day. ENDTIME set on a one-shot means
//! it already fired (imported as completed).

use std::collections::HashMap;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};

use crate::model::{EndMode, Priority, Recurrence, Reminder, fmt_dt, now_local};

/// CP1251 specials for 0x80..=0xBF (0x98 is undefined in the encoding and
/// reads as a space). Cyrillic 0xC0..=0xFF is computed from the range.
const CP1251_SPECIAL: [char; 64] = [
    'Ђ', 'Ѓ', '‚', 'ѓ', '„', '…', '†', '‡', '€', '‰', 'Љ', '‹', 'Њ', 'Ќ', 'Ћ', 'Џ', // 0x8F
    'ђ', '‘', '’', '“', '”', '•', '–', '—', '\u{00A0}', '™', 'љ', '›', 'њ', 'ќ', 'ћ',
    'џ', // 0x9F
    '\u{00A0}', 'Ў', 'ў', 'Ј', '¤', 'Ґ', '¦', '§', 'Ё', '©', 'Є', '«', '¬', '\u{00AD}', '®',
    'Ї', // 0xAF
    '°', '±', 'І', 'і', 'ґ', 'µ', '¶', '·', 'ё', '№', 'є', '»', 'ј', 'Ѕ', 'ѕ', 'ї', // 0xBF
];

fn decode_cp1251(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len());
    for &b in bytes {
        out.push(match b {
            0x00..=0x7F => b as char,
            0xC0..=0xFF => char::from_u32(0x0410 + u32::from(b - 0xC0)).unwrap(),
            _ => CP1251_SPECIAL[(b - 0x80) as usize],
        });
    }
    out
}

/// Parse a Delphi TDateTime ("days,frac" — the comma is a decimal separator).
/// Day 0 is 1899-12-30.
fn tdatetime(s: &str) -> Option<NaiveDateTime> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let (days_s, frac_s) = match s.split_once([',', '.']) {
        Some((d, f)) => (d, Some(f)),
        None => (s, None),
    };
    let days: i64 = days_s.trim().parse().ok()?;
    let frac: f64 = match frac_s {
        Some(f) if !f.trim().is_empty() => format!("0.{}", f.trim()).parse().unwrap_or(0.0),
        _ => 0.0,
    };
    let base = NaiveDate::from_ymd_opt(1899, 12, 30)?.and_hms_opt(0, 0, 0)?;
    Some(base + Duration::days(days) + Duration::seconds((frac * 86_400.0).round() as i64))
}

/// The section key "R20200128185630" is the creation timestamp.
fn parse_created(key: &str) -> Option<NaiveDateTime> {
    let s = key.strip_prefix('R')?;
    if s.len() != 14 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let num = |a: usize, b: usize| s[a..b].parse::<u32>().ok();
    NaiveDate::from_ymd_opt(num(0, 4)? as i32, num(4, 6)?, num(6, 8)?)?.and_hms_opt(
        num(8, 10)?,
        num(10, 12)?,
        num(12, 14)?,
    )
}

/// Monthly day set from REPEAT_DATA: every byte equal to 0x01 at index i
/// selects day i+1 of the month.
fn monthly_days(hex: &str) -> Vec<u8> {
    let mut days = Vec::new();
    let bytes = hex.as_bytes();
    for i in 0..(bytes.len() / 2).min(31) {
        let pair = std::str::from_utf8(&bytes[i * 2..i * 2 + 2]).unwrap_or("00");
        if let Ok(v) = u8::from_str_radix(pair, 16)
            && v == 1
        {
            days.push((i + 1) as u8);
        }
    }
    days
}

/// Weekly weekday set from REPEAT_DATA: a byte equal to 0x01 at index i
/// (0..=6, Sunday-first) selects a weekday. Returned in our Monday=1..=7,
/// Sunday=7 numbering (index 0 -> 7, index 1..=6 -> 1..=6).
fn weekly_weekdays(hex: &str) -> Vec<u8> {
    let mut out = Vec::new();
    let bytes = hex.as_bytes();
    for i in 0..7 {
        if (i * 2 + 2) > bytes.len() {
            break;
        }
        let pair = std::str::from_utf8(&bytes[i * 2..i * 2 + 2]).unwrap_or("00");
        if let Ok(1) = u8::from_str_radix(pair, 16) {
            out.push(if i == 0 { 7 } else { i as u8 });
        }
    }
    out
}

struct RawRecord {
    key: String,
    fields: HashMap<String, String>,
}

fn field(r: &RawRecord, name: &str) -> String {
    r.fields.get(name).cloned().unwrap_or_default()
}

/// The scheduled DATE for one-shot and yearly reminders: a little-endian
/// f64 TDateTime (midnight of the due day) stored at byte offset 7 of
/// REPEAT_DATA. Verified against real exports.
fn repeat_due_date(hex: &str) -> Option<NaiveDateTime> {
    let bytes = hex.as_bytes();
    if bytes.len() < 15 {
        return None;
    }
    let mut raw = [0u8; 8];
    for (j, slot) in raw.iter_mut().enumerate() {
        let at = (7 + j) * 2;
        *slot = u8::from_str_radix(std::str::from_utf8(&bytes[at..at + 2]).ok()?, 16).ok()?;
    }
    let days = f64::from_le_bytes(raw);
    if !(40_000.0..=60_000.0).contains(&days) {
        return None; // 2009..2036 — sanity window
    }
    Some(
        NaiveDate::from_ymd_opt(1899, 12, 30)?.and_hms_opt(0, 0, 0)?
            + Duration::days(days.round() as i64),
    )
}

/// Convert parsed Wise records into our reminders.
fn build_reminders(
    records: Vec<RawRecord>,
    titles: &HashMap<String, String>,
    now: NaiveDateTime,
) -> Vec<Reminder> {
    let mut out = Vec::new();
    for r in records {
        // Records without a title were not active in Wise — skip them.
        let Some(title) = titles.get(&r.key) else {
            continue;
        };
        let period: i32 = field(&r, "PERIOD").trim().parse().unwrap_or(-1);
        let Some(last) = tdatetime(&field(&r, "LASTTIME")) else {
            continue;
        };
        let end = tdatetime(&field(&r, "ENDTIME"));
        let created = parse_created(&r.key)
            .or_else(|| tdatetime(&field(&r, "CREATEDATETIME")))
            .unwrap_or(now);
        // WAKETIME holds the scheduled time of day (LASTTIME carries poll
        // jitter in its seconds — e.g. 10:00:58 for a 10:00 reminder).
        let wake_time = tdatetime(&field(&r, "WAKETIME")).map(|dt| dt.time());
        let due_from_repeat = repeat_due_date(&field(&r, "REPEAT_DATA"));

        let (recurrence, completed) = match period {
            1 => (Recurrence::Daily, false),
            2 => {
                // Weekly: decode the selected weekday set from REPEAT_DATA
                // (Sunday-first bitmask); fall back to the start weekday when
                // none is set. The start date is LASTTIME's date (poll jitter
                // only touches seconds).
                let mut weekdays = weekly_weekdays(&field(&r, "REPEAT_DATA"));
                if weekdays.is_empty() {
                    weekdays.push(last.weekday().num_days_from_monday() as u8 + 1);
                }
                (Recurrence::Weekly { weekdays }, false)
            }
            3 => {
                let mut days = monthly_days(&field(&r, "REPEAT_DATA"));
                if days.is_empty() {
                    days.push(last.day() as u8);
                }
                (Recurrence::Monthly { days }, false)
            }
            4 => {
                // Yearly: month/day come from the REPEAT_DATA date (the
                // anchor occurrence), NOT from LASTTIME — they diverge once
                // the user reschedules the reminder.
                let anchor = due_from_repeat.unwrap_or(last);
                (
                    Recurrence::Yearly {
                        month: anchor.month() as u8,
                        day: anchor.day() as u8,
                    },
                    false,
                )
            }
            // PERIOD=0 and unknown codes behave as one-shot reminders.
            _ => (Recurrence::Once, end.is_some()),
        };

        // Start datetime:
        // - already fired -> the actual fire moment (LASTTIME);
        // - recurring -> LASTTIME's date at the WAKETIME time of day
        //   (yearly: the REPEAT_DATA date);
        // - one-shot -> the REPEAT_DATA date (its due date, may be past —
        //   such a reminder fires once as "missed", faithful to Wise);
        // - one-shot without a REPEAT_DATA date -> DISABLED (nothing to
        //   schedule).
        let mut enabled = true;
        let mut note = String::new();
        let start_dt = if completed {
            // Wise displays the scheduled date (REPEAT_DATA double), not the
            // dismissal moment.
            due_from_repeat
                .map(|d| d.date().and_time(wake_time.unwrap_or_else(|| last.time())))
                .unwrap_or(last)
        } else if recurrence != Recurrence::Once {
            last.date()
                .and_time(wake_time.unwrap_or_else(|| last.time()))
        } else if let Some(due) = due_from_repeat {
            due.date()
                .and_time(wake_time.unwrap_or_else(|| last.time()))
        } else if last > now {
            last
        } else {
            enabled = false;
            note = "Wise import: the .dat does not store the pending date for this reminder — set it and enable."
                .into();
            last
        };

        let mut reminder = Reminder {
            id: String::new(),
            title: title.clone(),
            note,
            priority: Priority::Normal,
            start_at: fmt_dt(start_dt),
            recurrence,
            end_mode: EndMode::Never,
            fired_count: 0,
            next_due: None,
            enabled,
            completed,
            created_at: fmt_dt(created),
            updated_at: fmt_dt(now),
        };
        crate::db::sanitize_at(&mut reminder, now);
        if !reminder.completed && reminder.enabled {
            reminder.next_due = crate::scheduler::initial_next_due_at(&reminder, now);
        }
        out.push(reminder);
    }
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    out
}

/// Parse the raw bytes of a Wise Reminder .dat file.
pub fn parse_dat(bytes: &[u8]) -> Result<Vec<Reminder>, String> {
    parse_dat_at(bytes, now_local())
}

/// Use one import time for scheduling decisions and generated timestamps.
fn parse_dat_at(bytes: &[u8], now: NaiveDateTime) -> Result<Vec<Reminder>, String> {
    let text = decode_cp1251(bytes);
    let mut titles: HashMap<String, String> = HashMap::new();
    let mut records: Vec<RawRecord> = Vec::new();
    let mut section = String::new();
    let mut cur: Option<RawRecord> = None;

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(inner) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            if let Some(r) = cur.take() {
                records.push(r);
            }
            section = inner.to_string();
            if section.starts_with('R')
                && section.len() == 15
                && section[1..].bytes().all(|b| b.is_ascii_digit())
            {
                cur = Some(RawRecord {
                    key: section.clone(),
                    fields: HashMap::new(),
                });
            }
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        if section == "UNFINISHED" || section == "FINISHED" {
            titles
                .entry(k.trim().to_string())
                .or_insert_with(|| v.trim().to_string());
        } else if let Some(r) = cur.as_mut() {
            r.fields.insert(k.trim().to_string(), v.to_string());
        }
    }
    if let Some(r) = cur.take() {
        records.push(r);
    }
    Ok(build_reminders(records, &titles, now))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_dt;

    #[test]
    fn tdatetime_delphi_days() {
        // 46301 days after 1899-12-30 = 2026-10-06, frac -> 18:24:45
        // (matches the R-key timestamp of the matching fixture record).
        let dt = tdatetime("46301,7671845486").unwrap();
        assert_eq!(
            dt.format("%Y-%m-%d %H:%M:%S").to_string(),
            "2026-10-06 18:24:45"
        );
        // Dot as separator and empty value.
        assert_eq!(
            tdatetime("0,5").unwrap().format("%H:%M").to_string(),
            "12:00"
        );
        assert!(tdatetime("").is_none());
    }

    #[test]
    fn monthly_day_bitmask() {
        // From the real Wise file (the "Monthly report" fixture record):
        // days 5 and 20.
        assert_eq!(
            monthly_days("00000000010000000000000000000000000000010000000000000000000000"),
            vec![5, 20]
        );
        assert!(monthly_days("").is_empty());
    }

    #[test]
    fn weekly_weekday_bitmask() {
        // Sunday-first index -> our Monday=1..Sunday=7 numbering. These two
        // prefixes come straight from real 1.x weekly exports.
        assert_eq!(
            weekly_weekdays("010000000000003000320036002000320031003A00340031003A0032003800"),
            vec![7] // index 0 = Sunday
        );
        assert_eq!(
            weekly_weekdays("000100000000003000320036002000320031003A00340031003A0032003800"),
            vec![1] // index 1 = Monday
        );
        // Several bits at once (Mon, Wed, Fri) and the empty case.
        assert_eq!(weekly_weekdays("00010001000100"), vec![1, 3, 5]);
        assert!(weekly_weekdays("").is_empty());
        // Only indices 0..=6 are weekday slots; a 0x01 further in (the
        // internal time string region) is not a weekday.
        assert!(weekly_weekdays("00000000000000000001").is_empty());
    }

    #[test]
    fn cp1251_decodes_cyrillic() {
        let bytes: Vec<u8> = vec![0xCF, 0xE5, 0xF0, 0xE5, 0xE4, 0xE0, 0xF2, 0xFC];
        assert_eq!(decode_cp1251(&bytes), "Передать");
    }

    fn sample_dat() -> Vec<u8> {
        // Once fired, once pending, daily, weekly, monthly (day 18),
        // yearly (July 17).
        let ini = "\
[UNFINISHED]
R20200128185630=Once fired
R20210109032639=Once pending
R20210717103211=Monthly on the 18th
R20230729194335=Yearly July 30
R20260101090000=Daily standup
R20260102090000=Weekly sync

[R20200128185630]
PERIOD=0
LASTTIME=46215,864852338
ENDTIME=46215,8648526389
REPEAT_DATA=0000000000000000000000A090E64000000000000000000000000000

[R20210109032639]
PERIOD=0
LASTTIME=46301,7671845486
WAKETIME=0,595835868058202
ENDTIME=
REPEAT_DATA=0000000000000000000000A090E64000000000000000000000000000

[R20210717103211]
PERIOD=3
LASTTIME=46276,417347338
WAKETIME=0,41666667824029
ENDTIME=
REPEAT_DATA=00000000000000000000000000000000000100000000000000000000

[R20230729194335]
PERIOD=4
LASTTIME=46233,292365544
WAKETIME=0,291668749996461
ENDTIME=
REPEAT_DATA=0000000000000000000000200AE64000000000000000000000000000

[R20260101090000]
PERIOD=1
LASTTIME=46310,41666667824029
WAKETIME=0,41666667824029
ENDTIME=
REPEAT_DATA=000000000000000000000000000000000000000000000000000000000000

[R20260102090000]
PERIOD=2
LASTTIME=46301,41666667824029
WAKETIME=0,41666667824029
ENDTIME=
REPEAT_DATA=000000000000000000000000000000000000000000000000000000000000
";
        let mut bytes = Vec::new();
        for ch in ini.chars() {
            // ASCII-only fixture: encode as single bytes.
            bytes.push(ch as u8);
        }
        bytes
    }

    #[test]
    fn parses_sample_records() {
        let now = parse_dt("2026-10-17T12:00:00").unwrap();
        let list = parse_dat_at(&sample_dat(), now).unwrap();
        assert_eq!(list.len(), 6);
        let by_title = |t: &str| list.iter().find(|r| r.title == t).unwrap();

        let fired = by_title("Once fired");
        assert!(fired.completed);
        assert_eq!(fired.recurrence, Recurrence::Once);
        assert_eq!(fired.next_due, None);
        // Completed: the scheduled date comes from the REPEAT_DATA double
        // (Jul 10); the record has no WAKETIME, so LASTTIME's time is kept.
        assert_eq!(
            parse_dt(&fired.start_at)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-07-10 20:45"
        );

        let pending = by_title("Once pending");
        assert!(!pending.completed);
        // Never-fired one-shot: the scheduled date comes from the
        // REPEAT_DATA double (Jul 10 2026) at the WAKETIME time. Here it is
        // already past -> the reminder fires once as missed (faithful to
        // Wise) but never prematurely in the future.
        assert!(pending.enabled);
        assert!(pending.note.is_empty());
        assert_eq!(pending.next_due.as_deref(), Some("2026-07-10T14:18:00"));
        assert_eq!(
            parse_dt(&pending.start_at)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-07-10 14:18"
        );

        let monthly = by_title("Monthly on the 18th");
        assert_eq!(monthly.recurrence, Recurrence::Monthly { days: vec![18] });
        assert!(
            monthly
                .next_due
                .as_deref()
                .unwrap()
                .starts_with("2026-10-18T10:00")
        );

        let yearly = by_title("Yearly July 30");
        assert_eq!(yearly.recurrence, Recurrence::Yearly { month: 7, day: 30 });
        // 46233 days after 1899-12-30 = 2026-07-30 07:01.
        assert_eq!(
            parse_dt(&yearly.start_at)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-07-30 07:00"
        );

        // PERIOD=1 is a plain daily reminder (REPEAT_DATA carries nothing we
        // read); start = LASTTIME's date (2026-10-15) at the WAKETIME time.
        let daily = by_title("Daily standup");
        assert_eq!(daily.recurrence, Recurrence::Daily);
        assert!(!daily.completed);
        assert!(daily.next_due.as_deref().unwrap().ends_with("T10:00:00"));

        // PERIOD=2 is weekly; with no decodable weekday set it falls back to
        // the start weekday. LASTTIME 46301 = 2026-10-06, a Tuesday (Mon = 1).
        let weekly = by_title("Weekly sync");
        assert_eq!(weekly.recurrence, Recurrence::Weekly { weekdays: vec![2] });
        assert!(!weekly.completed);
    }

    /// End-to-end check against the bundled fixture: a trimmed but
    /// structure-faithful replica of a real Wise Reminder export (CP1251,
    /// titles translated into English).
    #[test]
    fn parses_bundled_fixture() {
        let bytes = include_bytes!("testdata/wise-sample.dat");
        let now = parse_dt("2026-10-17T12:00:00").unwrap();
        let list = parse_dat_at(bytes, now).unwrap();
        assert_eq!(list.len(), 10);

        // One-shot reminders fired and closed in Wise (ENDTIME set) must land
        // in the completed section with their scheduled date (REPEAT_DATA
        // double), not the dismissal moment.
        let z1 = list.iter().find(|r| r.title == "Completed task 1").unwrap();
        assert!(z1.completed);
        assert_eq!(
            parse_dt(&z1.start_at)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-07-10 10:00"
        );
        let z2 = list.iter().find(|r| r.title == "Completed task 2").unwrap();
        assert!(z2.completed);
        assert_eq!(
            parse_dt(&z2.start_at)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-06-15 08:00"
        );

        // Yearly: month/day come from the REPEAT_DATA double (Jul 17 2026),
        // next occurrence = the next anniversary at the WAKETIME time.
        let yearly = list.iter().find(|r| r.title == "Annual meeting").unwrap();
        assert_eq!(yearly.recurrence, Recurrence::Yearly { month: 7, day: 17 });
        assert_eq!(
            parse_dt(&yearly.start_at)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-07-17 10:00"
        );
        assert!(
            yearly
                .next_due
                .as_deref()
                .unwrap()
                .starts_with("2027-07-17T10:00")
        );

        // Monthly: day sets recovered from the REPEAT_DATA byte mask
        // (byte index i -> day i+1), fire time from WAKETIME.
        let monthly18 = list
            .iter()
            .find(|r| r.title == "Monthly maintenance")
            .unwrap();
        assert!(matches!(&monthly18.recurrence, Recurrence::Monthly { days } if days == &[18]));
        assert!(
            monthly18
                .next_due
                .as_deref()
                .unwrap()
                .starts_with("2026-10-18T10:00")
        );
        let monthly520 = list.iter().find(|r| r.title == "Monthly report").unwrap();
        assert!(matches!(&monthly520.recurrence, Recurrence::Monthly { days } if days == &[5, 20]));
        assert!(
            monthly520
                .next_due
                .as_deref()
                .unwrap()
                .starts_with("2026-10-20T08:00")
        );

        // Regression for the premature-firing bug: a pending one-shot
        // reminder gets its real future date back from the REPEAT_DATA
        // double (Nov 7 2026 10:00) and is imported ENABLED.
        let pending = list
            .iter()
            .find(|r| r.title == "Subscription renewal")
            .unwrap();
        assert!(pending.enabled);
        assert!(pending.note.is_empty());
        assert_eq!(pending.next_due.as_deref(), Some("2026-11-07T10:00:01"));

        // Unknown PERIOD code without a double: falls back to a disabled Once.
        let legacy = list
            .iter()
            .find(|r| r.title == "Legacy-format reminder")
            .unwrap();
        assert_eq!(legacy.recurrence, Recurrence::Once);
        assert!(!legacy.enabled);
        assert!(legacy.note.contains("does not store"));

        // PERIOD=1 is a plain daily reminder (its REPEAT_DATA carries only
        // the internal date double / time string, nothing we decode).
        let daily = list.iter().find(|r| r.title == "Daily standup").unwrap();
        assert_eq!(daily.recurrence, Recurrence::Daily);
        assert!(!daily.completed && daily.enabled);
        assert!(daily.next_due.is_some());

        // PERIOD=2 weekly: the Sunday-first REPEAT_DATA bit decodes into our
        // Monday=1..Sunday=7 numbering.
        let weekly_sun = list
            .iter()
            .find(|r| r.title == "Weekly review (Sunday)")
            .unwrap();
        assert_eq!(
            weekly_sun.recurrence,
            Recurrence::Weekly { weekdays: vec![7] }
        );
        assert!(weekly_sun.next_due.is_some());
        let weekly_mon = list
            .iter()
            .find(|r| r.title == "Weekly review (Mondays)")
            .unwrap();
        assert_eq!(
            weekly_mon.recurrence,
            Recurrence::Weekly { weekdays: vec![1] }
        );
    }

    #[test]
    fn recurrences_follow_the_supplied_import_time() {
        // Exercise the former failure boundary and a distant year without
        // consulting the system clock or changing the fixture's dates.
        for (now, monthly, report, yearly) in [
            (
                "2026-10-18T09:59:59",
                "2026-10-18T10:00:00",
                "2026-10-20T08:00:00",
                "2027-07-17T10:00:00",
            ),
            (
                "2026-10-18T10:00:00",
                "2026-11-18T10:00:00",
                "2026-10-20T08:00:00",
                "2027-07-17T10:00:00",
            ),
            (
                "2026-10-20T08:00:00",
                "2026-11-18T10:00:00",
                "2026-11-05T08:00:00",
                "2027-07-17T10:00:00",
            ),
            (
                "2027-07-17T10:00:00",
                "2027-07-18T10:00:00",
                "2027-07-20T08:00:00",
                "2028-07-17T10:00:00",
            ),
            (
                "2031-12-31T23:59:59",
                "2032-01-18T10:00:00",
                "2032-01-05T08:00:00",
                "2032-07-17T10:00:00",
            ),
        ] {
            let list = parse_dat_at(
                include_bytes!("testdata/wise-sample.dat"),
                parse_dt(now).unwrap(),
            )
            .unwrap();
            for (title, expected) in [
                ("Monthly maintenance", monthly),
                ("Monthly report", report),
                ("Annual meeting", yearly),
                // One-shots retain their scheduled slot even after it passes.
                ("Subscription renewal", "2026-11-07T10:00:01"),
            ] {
                let reminder = list.iter().find(|r| r.title == title).unwrap();
                assert!(reminder.enabled && !reminder.completed);
                assert_eq!(
                    reminder.next_due.as_deref(),
                    Some(expected),
                    "imported at {now}: {title}"
                );
            }
            assert!(list.iter().all(|r| r.updated_at == now));
            assert!(
                list.iter()
                    .filter(|r| r.completed)
                    .all(|r| r.next_due.is_none())
            );
        }
    }

    #[test]
    fn undated_one_shot_uses_the_supplied_import_time() {
        for (now, enabled) in [
            ("2025-12-31T12:00:00", true),
            ("2026-01-01T12:00:00", false),
            ("2031-12-31T23:59:59", false),
        ] {
            let list = parse_dat_at(
                include_bytes!("testdata/wise-sample.dat"),
                parse_dt(now).unwrap(),
            )
            .unwrap();
            let reminder = list
                .iter()
                .find(|r| r.title == "Legacy-format reminder")
                .unwrap();
            assert_eq!(reminder.enabled, enabled, "imported at {now}");
            assert_eq!(
                reminder.next_due.as_deref(),
                enabled.then_some("2026-01-01T12:00:00"),
                "imported at {now}"
            );
            assert_eq!(reminder.note.is_empty(), enabled);
        }
    }
}
