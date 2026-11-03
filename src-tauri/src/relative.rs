//! Relative timestamps for import: values like `"+2h"` or `"-6d19h"` are
//! resolved against the import moment, so the demo templates in `demo/` never
//! go stale. The stored format stays absolute (`%Y-%m-%dT%H:%M:%S`); only the
//! import path materializes offsets, and the exporter always writes absolute
//! stamps back.

use chrono::{Duration, NaiveDateTime};

use crate::model::{Reminder, fmt_dt};

/// Parse a relative offset: a `+`/`-` sign followed by day, hour and minute
/// components in that order, at least one, without separators — `"+2h"`,
/// `"-6d19h"`, `"+45m"`. Anything else (including absolute timestamps) is
/// rejected with `None`.
pub fn parse_offset(s: &str) -> Option<Duration> {
    let mut chars = s.chars();
    let negative = match chars.next()? {
        '+' => false,
        '-' => true,
        _ => return None,
    };
    // Day < hour < minute: components must appear in this order, each at most
    // once. Bounds keep absurd values from overflowing the arithmetic below.
    let mut previous_unit: Option<u8> = None;
    let mut digits: Option<i64> = None;
    let mut total = Duration::zero();
    for c in chars {
        if let Some(d) = c.to_digit(10) {
            let n = digits.unwrap_or(0) * 10 + i64::from(d);
            if n > 1_000_000 {
                return None;
            }
            digits = Some(n);
            continue;
        }
        let unit = match c {
            'd' => 0,
            'h' => 1,
            'm' => 2,
            _ => return None,
        };
        if matches!(previous_unit, Some(previous) if unit <= previous) {
            return None;
        }
        previous_unit = Some(unit);
        let n = digits.take()?;
        total += match unit {
            0 => Duration::days(n),
            1 => Duration::hours(n),
            _ => Duration::minutes(n),
        };
    }
    // A trailing number without a unit, or a bare sign, is not an offset.
    if digits.is_some() || previous_unit.is_none() {
        return None;
    }
    Some(if negative { -total } else { total })
}

/// Absolute stamp for a relative offset — `None` when `value` is not relative
/// (absolute stamps and anything unrecognized are left to the caller).
pub fn resolve(value: &str, now: NaiveDateTime) -> Option<String> {
    parse_offset(value).map(|offset| fmt_dt(now + offset))
}

/// Materialize the relative `startAt`/`createdAt` of an imported reminder.
/// `nextDue` needs no handling: the importer recomputes it from the rule.
pub fn resolve_reminder(r: &mut Reminder, now: NaiveDateTime) {
    if let Some(absolute) = resolve(&r.start_at, now) {
        r.start_at = absolute;
    }
    if let Some(absolute) = resolve(&r.created_at, now) {
        r.created_at = absolute;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_dt;

    fn fixture(start_at: &str, created_at: &str) -> Reminder {
        serde_json::from_value(serde_json::json!({
            "id": "",
            "title": "t",
            "note": "",
            "priority": "normal",
            "startAt": start_at,
            "recurrence": { "type": "once" },
            "endMode": { "type": "never" },
            "firedCount": 0,
            "nextDue": null,
            "enabled": true,
            "completed": false,
            "createdAt": created_at,
            "updatedAt": ""
        }))
        .expect("fixture reminder")
    }

    #[test]
    fn parses_single_component_offsets() {
        assert_eq!(parse_offset("+2h"), Some(Duration::hours(2)));
        assert_eq!(parse_offset("-30d"), Some(Duration::days(-30)));
        assert_eq!(parse_offset("+45m"), Some(Duration::minutes(45)));
        assert_eq!(parse_offset("+1d"), Some(Duration::days(1)));
    }

    #[test]
    fn parses_composite_offsets() {
        assert_eq!(
            parse_offset("-6d19h"),
            Some(Duration::days(-6) - Duration::hours(19))
        );
        assert_eq!(
            parse_offset("+1d2h3m"),
            Some(Duration::days(1) + Duration::hours(2) + Duration::minutes(3))
        );
    }

    #[test]
    fn rejects_malformed_offsets() {
        for bad in [
            "",
            "+",
            "-",
            "2h",
            "+h",
            "+2",
            "+2H",
            "+2h30",
            "+1h2d",
            "+1d1d",
            "+2x",
            "+ 2h",
            "+2h ",
            "+2ч",
            "вчера",
        ] {
            assert_eq!(parse_offset(bad), None, "{bad:?} must not parse");
        }
    }

    #[test]
    fn resolves_against_the_import_moment() {
        let now = parse_dt("2026-10-11T22:00:00").unwrap();
        assert_eq!(resolve("+2h", now).as_deref(), Some("2026-10-12T00:00:00"));
        assert_eq!(
            resolve("-6d19h", now).as_deref(),
            Some("2026-10-05T03:00:00")
        );
    }

    #[test]
    fn leaves_absolute_and_unknown_values_untouched() {
        let now = parse_dt("2026-10-11T22:00:00").unwrap();
        assert_eq!(resolve("2026-10-11T23:00:00", now), None);
        assert_eq!(resolve("midnight", now), None);
        assert_eq!(resolve("", now), None);
    }

    #[test]
    fn resolve_reminder_materializes_only_relative_fields() {
        let now = parse_dt("2026-10-11T22:00:00").unwrap();

        let mut relative = fixture("-13h", "-30d");
        resolve_reminder(&mut relative, now);
        assert_eq!(relative.start_at, "2026-10-11T09:00:00");
        assert_eq!(relative.created_at, "2026-09-11T22:00:00");

        let mut absolute = fixture("2026-12-01T10:00:00", "2026-01-05T10:00:00");
        resolve_reminder(&mut absolute, now);
        assert_eq!(absolute.start_at, "2026-12-01T10:00:00");
        assert_eq!(absolute.created_at, "2026-01-05T10:00:00");
    }
}
