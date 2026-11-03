//! Recurrence math: given a reminder's start time and rule, compute the next
//! occurrence strictly after a given moment. All arithmetic is on naive local
//! wall-clock time (stored as "YYYY-MM-DDTHH:MM:SS").

use crate::model::{IntervalUnit, Recurrence};
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};

/// Next occurrence strictly after `after`; `start` itself if it is still ahead.
pub fn next_after(
    start: NaiveDateTime,
    rec: &Recurrence,
    after: NaiveDateTime,
) -> Option<NaiveDateTime> {
    if start > after {
        return Some(start);
    }
    match rec {
        Recurrence::Once => None,
        Recurrence::Daily => next_daily(start, after),
        Recurrence::Weekly { weekdays } => next_weekly(start, weekdays, after),
        Recurrence::Monthly { days } => next_monthly(start, days, after),
        Recurrence::Yearly { month, day } => next_yearly(start, *month, *day, after),
        Recurrence::Interval { unit, n } => next_interval(start, *unit, *n, after),
    }
}

fn next_daily(start: NaiveDateTime, after: NaiveDateTime) -> Option<NaiveDateTime> {
    let t = start.time();
    let mut cand = after.date().and_time(t);
    if cand <= after {
        cand += Duration::days(1);
    }
    Some(cand)
}

fn next_weekly(
    start: NaiveDateTime,
    weekdays: &[u8],
    after: NaiveDateTime,
) -> Option<NaiveDateTime> {
    if weekdays.is_empty() {
        return None;
    }
    let t = start.time();
    let first = after.date();
    for offset in 0..14i64 {
        let d = first + Duration::days(offset);
        let wd = d.weekday().number_from_monday(); // 1 = Monday .. 7 = Sunday
        if !weekdays.contains(&(wd as u8)) {
            continue;
        }
        let cand = d.and_time(t);
        if cand > after {
            return Some(cand);
        }
    }
    None
}

/// Selected days-of-month clamped to the month's length: day 31 fires on
/// Feb 28/29, Apr 30 and so on. With several selected days the earliest
/// clamped candidate after `after` wins.
fn next_monthly(start: NaiveDateTime, days: &[u8], after: NaiveDateTime) -> Option<NaiveDateTime> {
    if days.is_empty() {
        return None;
    }
    let t = start.time();
    let base = after.date();
    let base_index = base.year() * 12 + base.month0() as i32;
    for m in 0..=25 {
        let (y, mo) = month_from_index(base_index + m);
        let mut best: Option<NaiveDateTime> = None;
        for &day in days {
            let d = clamp_day(y, mo, day);
            let cand = d.and_time(t);
            if cand > after && best.is_none_or(|b| cand < b) {
                best = Some(cand);
            }
        }
        if let Some(b) = best {
            return Some(b);
        }
    }
    None
}

/// Yearly on the given month/day; Feb 29 falls back to Feb 28 on non-leap years.
fn next_yearly(
    start: NaiveDateTime,
    month: u8,
    day: u8,
    after: NaiveDateTime,
) -> Option<NaiveDateTime> {
    let t = start.time();
    for y in after.year()..=after.year() + 200 {
        let d = clamp_day(y, month as u32, day);
        let cand = d.and_time(t);
        if cand > after {
            return Some(cand);
        }
    }
    None
}

fn next_interval(
    start: NaiveDateTime,
    unit: IntervalUnit,
    n: u32,
    after: NaiveDateTime,
) -> Option<NaiveDateTime> {
    let n = n.max(1);
    match unit {
        IntervalUnit::Minutes | IntervalUnit::Hours | IntervalUnit::Days | IntervalUnit::Weeks => {
            let secs: i64 = match unit {
                IntervalUnit::Minutes => 60,
                IntervalUnit::Hours => 3600,
                IntervalUnit::Days => 86400,
                IntervalUnit::Weeks => 604800,
                _ => unreachable!(),
            } * n as i64;
            let elapsed = (after - start).num_seconds();
            // elapsed >= 0 here (start <= after)
            let k = elapsed.div_euclid(secs) + 1;
            Some(start + Duration::seconds(secs * k))
        }
        IntervalUnit::Months | IntervalUnit::Years => {
            let t = start.time();
            let months_per_step = if unit == IntervalUnit::Years {
                12 * n as i32
            } else {
                n as i32
            };
            let start_index = start.year() * 12 + start.month0() as i32;
            let after_index = after.year() * 12 + after.month0() as i32;
            // Highest step still within `after`'s month, then walk forward
            // until the candidate is strictly past `after` (day-of-month can
            // still put it ahead within the same month).
            let mut m = ((after_index - start_index) / months_per_step).max(0);
            loop {
                let cand = add_months(start.date(), months_per_step * m).and_time(t);
                if cand > after {
                    return Some(cand);
                }
                m += 1;
                if m > 2400 {
                    return None;
                }
            }
        }
    }
}

fn month_from_index(index: i32) -> (i32, u32) {
    (index.div_euclid(12), index.rem_euclid(12) as u32 + 1)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn clamp_day(year: i32, month: u32, day: u8) -> NaiveDate {
    let day = (day as u32).clamp(1, days_in_month(year, month));
    NaiveDate::from_ymd_opt(year, month, day).unwrap()
}

/// Add months to a date, clamping the day (Jan 31 + 1 month -> Feb 28).
fn add_months(d: NaiveDate, months: i32) -> NaiveDate {
    let index = d.year() * 12 + d.month0() as i32 + months;
    let (y, m) = month_from_index(index);
    clamp_day(y, m, d.day() as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::IntervalUnit as IU;

    fn dt(s: &str) -> NaiveDateTime {
        crate::model::parse_dt(s).unwrap()
    }

    #[test]
    fn once_future_returns_start() {
        let start = dt("2026-10-11T09:00:00");
        let after = dt("2026-10-10T00:00:00");
        assert_eq!(next_after(start, &Recurrence::Once, after), Some(start));
    }

    #[test]
    fn once_past_returns_none() {
        let start = dt("2026-10-11T09:00:00");
        let after = dt("2026-10-11T09:00:01");
        assert_eq!(next_after(start, &Recurrence::Once, after), None);
    }

    #[test]
    fn daily_next_day_same_time() {
        let start = dt("2026-10-11T09:00:00");
        let after = dt("2026-10-11T09:05:00");
        assert_eq!(
            next_after(start, &Recurrence::Daily, after),
            Some(dt("2026-10-12T09:00:00"))
        );
    }

    #[test]
    fn daily_exact_boundary_is_next_day() {
        let start = dt("2026-10-11T09:00:00");
        let after = dt("2026-10-11T09:00:00");
        assert_eq!(
            next_after(start, &Recurrence::Daily, after),
            Some(dt("2026-10-12T09:00:00"))
        );
    }

    #[test]
    fn weekly_picks_next_selected_weekday() {
        // 2026-10-11 is a Sunday.
        let start = dt("2026-10-11T18:30:00");
        let rec = Recurrence::Weekly {
            weekdays: vec![1, 3],
        }; // Mon, Wed
        let after = dt("2026-10-11T20:00:00");
        assert_eq!(
            next_after(start, &rec, after),
            Some(dt("2026-10-12T18:30:00"))
        );
        let after2 = dt("2026-10-12T18:30:00");
        assert_eq!(
            next_after(start, &rec, after2),
            Some(dt("2026-10-14T18:30:00"))
        );
    }

    #[test]
    fn weekly_empty_is_none() {
        let start = dt("2026-10-11T18:30:00");
        let rec = Recurrence::Weekly { weekdays: vec![] };
        assert_eq!(next_after(start, &rec, start), None);
    }

    #[test]
    fn monthly_clamps_to_shorter_month() {
        // Jan 31 -> Feb has no 31st, clamped to Feb 28 (2027 is not a leap year).
        let start = dt("2027-01-31T10:00:00");
        let rec = Recurrence::Monthly { days: vec![31] };
        let after = dt("2027-01-31T10:00:00");
        assert_eq!(
            next_after(start, &rec, after),
            Some(dt("2027-02-28T10:00:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2027-02-28T10:00:00")),
            Some(dt("2027-03-31T10:00:00"))
        );
    }

    #[test]
    fn monthly_clamps_to_leap_day() {
        let start = dt("2028-01-31T10:00:00");
        let rec = Recurrence::Monthly { days: vec![31] };
        assert_eq!(
            next_after(start, &rec, start),
            Some(dt("2028-02-29T10:00:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2028-02-29T10:00:00")),
            Some(dt("2028-03-31T10:00:00"))
        );
    }

    #[test]
    fn monthly_stays_within_current_month_when_possible() {
        let start = dt("2026-10-05T08:00:00");
        let rec = Recurrence::Monthly { days: vec![20] };
        let after = dt("2026-10-05T08:00:00");
        assert_eq!(
            next_after(start, &rec, after),
            Some(dt("2026-10-20T08:00:00"))
        );
    }

    #[test]
    fn monthly_multiple_days_pick_the_nearest() {
        // Days 5 and 20: after Oct 6 the next one is Oct 20, then Nov 5.
        let start = dt("2026-10-05T08:00:00");
        let rec = Recurrence::Monthly { days: vec![20, 5] };
        assert_eq!(
            next_after(start, &rec, dt("2026-10-06T08:00:00")),
            Some(dt("2026-10-20T08:00:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2026-10-20T08:00:00")),
            Some(dt("2026-11-05T08:00:00"))
        );
        // Day 31 clamps to Feb 28 while day 15 stays real: 15 wins in February.
        let rec2 = Recurrence::Monthly { days: vec![31, 15] };
        assert_eq!(
            next_after(start, &rec2, dt("2027-01-31T08:00:00")),
            Some(dt("2027-02-15T08:00:00"))
        );
        assert_eq!(
            next_after(start, &rec2, dt("2027-02-15T08:00:00")),
            Some(dt("2027-02-28T08:00:00"))
        );
    }

    #[test]
    fn yearly_feb29_falls_back_to_feb28() {
        let start = dt("2028-02-29T12:00:00"); // 2028 is a leap year
        let rec = Recurrence::Yearly { month: 2, day: 29 };
        let after = dt("2028-02-29T12:00:00");
        // Clamped like monthly: every year has exactly one occurrence.
        assert_eq!(
            next_after(start, &rec, after),
            Some(dt("2029-02-28T12:00:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2029-02-28T12:00:00")),
            Some(dt("2030-02-28T12:00:00"))
        );
        // In leap years the real Feb 29 is used: after 2032-02-28 the next
        // occurrence is the leap day itself.
        assert_eq!(
            next_after(start, &rec, dt("2031-02-28T12:00:00")),
            Some(dt("2032-02-29T12:00:00"))
        );
    }

    #[test]
    fn interval_minutes_arithmetic() {
        let start = dt("2026-10-11T09:00:00");
        let rec = Recurrence::Interval {
            unit: IU::Minutes,
            n: 15,
        };
        assert_eq!(
            next_after(start, &rec, dt("2026-10-11T09:00:00")),
            Some(dt("2026-10-11T09:15:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2026-10-11T09:16:00")),
            Some(dt("2026-10-11T09:30:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2026-10-11T14:59:00")),
            Some(dt("2026-10-11T15:00:00"))
        );
    }

    #[test]
    fn interval_hours_large_gap() {
        let start = dt("2026-01-01T00:00:00");
        let rec = Recurrence::Interval {
            unit: IU::Hours,
            n: 6,
        };
        // Fast-forward far ahead without stepping.
        assert_eq!(
            next_after(start, &rec, dt("2026-01-10T13:07:00")),
            Some(dt("2026-01-10T18:00:00"))
        );
    }

    #[test]
    fn interval_months_keeps_day_clamped() {
        let start = dt("2026-01-31T09:00:00");
        let rec = Recurrence::Interval {
            unit: IU::Months,
            n: 1,
        };
        assert_eq!(
            next_after(start, &rec, dt("2026-01-31T09:00:00")),
            Some(dt("2026-02-28T09:00:00"))
        );
        assert_eq!(
            next_after(start, &rec, dt("2026-02-28T09:00:00")),
            Some(dt("2026-03-31T09:00:00"))
        );
    }

    #[test]
    fn interval_years() {
        let start = dt("2026-03-15T09:00:00");
        let rec = Recurrence::Interval {
            unit: IU::Years,
            n: 2,
        };
        assert_eq!(
            next_after(start, &rec, dt("2026-03-15T09:00:00")),
            Some(dt("2028-03-15T09:00:00"))
        );
    }

    #[test]
    fn interval_weeks() {
        let start = dt("2026-10-05T09:00:00");
        let rec = Recurrence::Interval {
            unit: IU::Weeks,
            n: 2,
        };
        assert_eq!(
            next_after(start, &rec, dt("2026-10-05T09:00:00")),
            Some(dt("2026-10-19T09:00:00"))
        );
    }

    #[test]
    fn future_start_wins_over_rule() {
        let start = dt("2030-01-01T09:00:00");
        let rec = Recurrence::Interval {
            unit: IU::Minutes,
            n: 5,
        };
        assert_eq!(
            next_after(start, &rec, dt("2026-10-11T00:00:00")),
            Some(start)
        );
    }
}
