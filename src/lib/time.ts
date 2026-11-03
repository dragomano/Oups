import type { IntervalUnit, Recurrence } from "./api";
import { i18n, lookup, pluralForms, t, unitGender } from "./i18n.svelte";
import { pluralCategory, pluralSlot } from "./plural";

/** Parse stored local time "YYYY-MM-DDTHH:MM:SS" into a Date. */
export function parseLocal(s: string | null | undefined): Date | null {
  if (!s) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s);

  if (!m) return null;

  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** Return the number of days in a Gregorian calendar month. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0;

  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat(i18n.lang, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat(i18n.lang, { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat(i18n.lang, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/**
 * "in 5 minutes" / "5 minutes ago" style relative time. `now` is a parameter so
 * tests can freeze it and components can drive every label from the shared
 * clock (see `clock.svelte.ts`) instead of reading the wall clock per row.
 */
export function fmtRelative(d: Date, now = Date.now()): string {
  const diffMin = Math.round((d.getTime() - now) / 60000);
  const rtf = new Intl.RelativeTimeFormat(i18n.lang, { numeric: "auto" });
  const abs = Math.abs(diffMin);

  if (abs < 1) return rtf.format(0, "minute");
  if (abs < 60) return rtf.format(diffMin, "minute");
  if (abs < 60 * 48) return rtf.format(Math.round(diffMin / 60), "hour");

  return rtf.format(Math.round(diffMin / 1440), "day");
}

/** The declined form at `key` for a count n; see `plural.ts`. */
export function declinedWord(key: string, n: number): string {
  const forms = t(key).split("|");

  return forms[pluralSlot(i18n.lang, forms, pluralForms(), n)] ?? forms[0];
}

/** The declined time unit for a count n ("минуту", "минуты", "минут"). */
export function formatUnit(unit: IntervalUnit, n: number): string {
  return declinedWord(`every_many.${unit}`, n);
}

/**
 * The label for a snooze preset. Minute counts reuse the shared declined noun
 * ("5 минут", "5 хвилин"). An hour and a day keep their own keys: "1 сутки" is
 * not the recurrence word "день".
 */
export function snoozePresetLabel(minutes: number): string {
  if (minutes === 60) return t("popup.snooze_60");
  if (minutes === 1440) return t("popup.snooze_1440");

  return `${minutes} ${formatUnit("minutes", minutes)}`;
}

/**
 * The word matching "Every" for n and unit: "Каждый 21 час", "Каждую 21 минуту",
 * "Каждые 5 минут", "Alle 5 Minuten", "Co 5 minut". Only a language whose word
 * agrees with the noun's gender declares `meta.unit_genders` and supplies
 * `editor.every_m` / `editor.every_f`; every other language declares neither and
 * simply spells `editor.every`.
 */
export function everyPrefix(unit: IntervalUnit, n: number): string {
  if (pluralCategory(i18n.lang, n) === "one") {
    const gender = unitGender(unit);

    if (gender) return lookup(`editor.every_${gender}`) ?? t("editor.every");
  }

  return t("editor.every");
}

export function recurrenceText(rec: Recurrence): string {
  switch (rec.type) {
    case "once":
      return t("rec.once");
    case "daily":
      return t("rec.daily");
    case "weekly": {
      if (!rec.weekdays || rec.weekdays.length === 0) return t("rec.weekly");

      // Full day names here: this text is read, not scanned. The compact
      // abbreviations stay in the editor's day toggles (RecurrencePicker).
      return rec.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((w) => t(`weekdays_full.${w}`))
        .join(", ");
    }
    case "monthly": {
      const days = [...rec.days].sort((a, b) => a - b);

      if (days.length === 1) return t("rec.monthly_on", { day: days[0] });

      return t("rec.monthly_on_multi", { days: days.join(", ") });
    }
    case "yearly": {
      // The day is shown as it was entered: a rule on 30 July reads "30 июля",
      // matching the next run the scheduler picks. It is clamped to the LENGTH
      // of that month — the same rule `recurrence.rs::clamp_day` applies — so an
      // impossible day (Feb 31) cannot roll into the next month. 2024 is a leap
      // year, so Feb 29 has a real date to format; non-leap years fall back to
      // the 28th only when they fire, which the next run already shows.
      const monthDays = daysInMonth(2024, rec.month) || 31;
      const day = Math.min(Math.max(Math.trunc(rec.day) || 1, 1), monthDays);
      const date = new Intl.DateTimeFormat(i18n.lang, { day: "numeric", month: "long" }).format(
        new Date(2024, rec.month - 1, day),
      );

      return t("rec.yearly_on", { date });
    }
    case "interval": {
      const unit = rec.unit as IntervalUnit;

      if (rec.n === 1) return t(`every_one.${unit}`);

      return `${everyPrefix(unit, rec.n)} ${rec.n} ${formatUnit(unit, rec.n)}`;
    }
  }
}

/** Today's date as "YYYY-MM-DD" for <input type="date">. */
export function todayStr(): string {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Current local time as "HH:MM" for <input type="time">. */
export function nowTimeStr(): string {
  const d = new Date();

  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The moment built from a `YYYY-MM-DD` date and an `HH:MM` time is already
 * behind the clock. Seconds are ignored on purpose, so the editor's own
 * default — today at the current minute — is not reported as past.
 */
export function isPastDateTime(dateStr: string, timeStr: string, now = new Date()): boolean {
  const entered = parseLocal(`${dateStr}T${timeStr}:00`);

  if (!entered) return false;

  const currentMinute = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
  );

  return entered.getTime() < currentMinute.getTime();
}
