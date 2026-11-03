import { beforeEach, describe, expect, it } from "vitest";
import type { Recurrence } from "./api";
import { i18n, t } from "./i18n.svelte";
import {
  daysInMonth,
  everyPrefix,
  fmtRelative,
  formatUnit,
  isPastDateTime,
  nowTimeStr,
  parseLocal,
  recurrenceText,
  todayStr,
} from "./time";

const RU_DICT = {
  meta: {
    code: "ru",
    name: "Русский",
    dir: "ltr",
    plural_forms: { one: 0, few: 1, many: 2, other: 2 },
    unit_genders: { minutes: "f", hours: "m", days: "m", weeks: "f", months: "m", years: "m" },
  },
  rec: {
    once: "Однократно",
    daily: "Каждый день",
    weekly: "По дням недели",
    monthly_on: "Ежемесячно {day} числа",
    monthly_on_multi: "Ежемесячно {days} числа",
    yearly_on: "Ежегодно {date}",
    interval: "По интервалу",
  },
  every_one: { minutes: "Каждую минуту", hours: "Каждый час" },
  every_many: { minutes: "минуту|минуты|минут", hours: "час|часа|часов" },
  weekdays_short: { 1: "Пн", 3: "Ср" },
  weekdays_full: {
    1: "Понедельник",
    2: "Вторник",
    3: "Среда",
    4: "Четверг",
    5: "Пятница",
    6: "Суббота",
    7: "Воскресенье",
  },
  editor: { every: "Каждые", every_m: "Каждый", every_f: "Каждую" },
  msg: { exported: "Экспортировано: {n}" },
};

describe("t()", () => {
  beforeEach(() => {
    i18n.lang = "ru";
    i18n.dict = structuredClone(RU_DICT) as unknown as Record<string, unknown>;
  });

  it("resolves nested keys", () => {
    expect(t("rec.once")).toBe("Однократно");
    expect(t("rec.monthly_on", { day: 15 })).toBe("Ежемесячно 15 числа");
  });

  it("substitutes variables", () => {
    expect(t("msg.exported", { n: 7 })).toBe("Экспортировано: 7");
  });

  it("falls back to the key when missing", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });
});

describe("parseLocal", () => {
  it("parses the stored timestamp format", () => {
    const d = parseLocal("2026-10-11T09:05:03");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(9);
    expect(d?.getDate()).toBe(11);
    expect(d?.getHours()).toBe(9);
    expect(d?.getMinutes()).toBe(5);
    expect(d?.getSeconds()).toBe(3);
  });

  it("returns null for empty or malformed input", () => {
    expect(parseLocal(null)).toBeNull();
    expect(parseLocal("")).toBeNull();
    expect(parseLocal("not a date")).toBeNull();
  });
});

describe("daysInMonth", () => {
  it("handles regular, leap, century, and 400-year February rules", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it("returns the lengths of other months", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("returns zero for an invalid month", () => {
    expect(daysInMonth(2026, 0)).toBe(0);
    expect(daysInMonth(2026, 13)).toBe(0);
  });
});

describe("todayStr", () => {
  it("returns a zero-padded YYYY-MM-DD string", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("nowTimeStr", () => {
  it("returns a zero-padded HH:MM string", () => {
    expect(nowTimeStr()).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("fmtRelative", () => {
  beforeEach(() => {
    i18n.lang = "ru";
  });

  const now = new Date(2026, 9, 12, 10, 0, 0).getTime();
  const at = (minutes: number) => new Date(now + minutes * 60000);

  it("describes the near future and past in minutes", () => {
    expect(fmtRelative(at(0), now)).toBe("в эту минуту");
    expect(fmtRelative(at(5), now)).toBe("через 5 минут");
    expect(fmtRelative(at(-5), now)).toBe("5 минут назад");
  });

  it("switches to hours past an hour and to days past two days", () => {
    expect(fmtRelative(at(60), now)).toBe("через 1 час");
    expect(fmtRelative(at(23 * 60), now)).toBe("через 23 часа");

    // numeric: "auto" prefers word forms, so the day bucket reads naturally too.
    expect(fmtRelative(at(2 * 1440), now)).toBe("послезавтра");
    expect(fmtRelative(at(6 * 1440), now)).toBe("через 6 дней");
  });

  it("reads the injected now, not the wall clock", () => {
    const moment = at(90);

    expect(fmtRelative(moment, now)).toBe("через 2 часа");
    expect(fmtRelative(moment, moment.getTime())).toBe("в эту минуту");
  });
});

describe("isPastDateTime", () => {
  const now = new Date(2026, 9, 11, 18, 30, 45);

  it("flags earlier days and earlier times", () => {
    expect(isPastDateTime("2026-10-10", "23:59", now)).toBe(true);
    expect(isPastDateTime("2026-10-11", "09:00", now)).toBe(true);
  });

  it("ignores seconds so today at the current minute is not past", () => {
    expect(isPastDateTime("2026-10-11", "18:30", now)).toBe(false);
  });

  it("passes moments still ahead", () => {
    expect(isPastDateTime("2026-10-11", "18:31", now)).toBe(false);
    expect(isPastDateTime("2026-10-12", "00:00", now)).toBe(false);
  });

  it("returns false for an incomplete or malformed pair", () => {
    expect(isPastDateTime("", "", now)).toBe(false);
    expect(isPastDateTime("2026-10-11", "", now)).toBe(false);
    expect(isPastDateTime("11.10.2026", "09:00", now)).toBe(false);
  });
});

describe("recurrenceText", () => {
  beforeEach(() => {
    i18n.lang = "ru";
    i18n.dict = structuredClone(RU_DICT) as unknown as Record<string, unknown>;
  });

  it("describes once and daily", () => {
    expect(recurrenceText({ type: "once" })).toBe("Однократно");
    expect(recurrenceText({ type: "daily" })).toBe("Каждый день");
  });

  it("joins full weekday names in order", () => {
    expect(recurrenceText({ type: "weekly", weekdays: [3, 1] })).toBe("Понедельник, Среда");
  });

  it("uses full names even for a single weekday", () => {
    expect(recurrenceText({ type: "weekly", weekdays: [3] })).toBe("Среда");
  });

  it("sorts a full week into Monday-first order", () => {
    const weekdays = [7, 3, 1, 5];
    expect(recurrenceText({ type: "weekly", weekdays })).toBe("Понедельник, Среда, Пятница, Воскресенье");
  });

  it("shows the yearly day as entered, clamped only to the month length", () => {
    expect(recurrenceText({ type: "yearly", month: 7, day: 30 })).toBe("Ежегодно 30 июля");
    expect(recurrenceText({ type: "yearly", month: 12, day: 31 })).toBe("Ежегодно 31 декабря");
    // 29 February exists in a leap year: the rule keeps saying 29 even though
    // most firings land on the 28th (the next run shows which).
    expect(recurrenceText({ type: "yearly", month: 2, day: 29 })).toBe("Ежегодно 29 февраля");
    // An impossible day falls back to the last day of that month, exactly like
    // `recurrence.rs::clamp_day`, instead of rolling into March.
    expect(recurrenceText({ type: "yearly", month: 2, day: 31 })).toBe("Ежегодно 29 февраля");
  });

  it("uses singular wording for n = 1 and Russian plural for n > 1", () => {
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 1 })).toBe("Каждую минуту");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 2 })).toBe("Каждые 2 минуты");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 5 })).toBe("Каждые 5 минут");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 2 })).toBe("Каждые 2 часа");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 5 })).toBe("Каждые 5 часов");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 21 })).toBe("Каждый 21 час");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 21 })).toBe("Каждую 21 минуту");
  });

  it("declines units and prefixes correctly", () => {
    expect(everyPrefix("minutes", 1)).toBe("Каждую");
    expect(everyPrefix("hours", 1)).toBe("Каждый");
    expect(everyPrefix("minutes", 2)).toBe("Каждые");
    expect(everyPrefix("hours", 5)).toBe("Каждые");
    expect(everyPrefix("minutes", 21)).toBe("Каждую");
    expect(everyPrefix("hours", 21)).toBe("Каждый");

    expect(formatUnit("minutes", 1)).toBe("минуту");
    expect(formatUnit("minutes", 2)).toBe("минуты");
    expect(formatUnit("minutes", 5)).toBe("минут");
    expect(formatUnit("hours", 1)).toBe("час");
    expect(formatUnit("hours", 3)).toBe("часа");
    expect(formatUnit("hours", 10)).toBe("часов");
  });

  it("falls back to English plural forms", () => {
    i18n.lang = "en";
    i18n.dict = {
      editor: { every: "Every" },
      every_one: { hours: "Every hour" },
      every_many: { hours: "hour|hours" },
    } as unknown as Record<string, unknown>;
    expect(recurrenceText({ type: "interval", unit: "hours", n: 1 })).toBe("Every hour");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 3 })).toBe("Every 3 hours");
  });
});

describe("recurrence type coverage", () => {
  beforeEach(() => {
    i18n.lang = "ru";
    i18n.dict = structuredClone(RU_DICT) as unknown as Record<string, unknown>;
  });

  it("never throws for any rule shape", () => {
    const shapes: Recurrence[] = [
      { type: "once" },
      { type: "daily" },
      { type: "weekly", weekdays: [] },
      { type: "monthly", days: [31] },
      { type: "yearly", month: 2, day: 29 },
      { type: "yearly", month: 13, day: Number.NaN },
      { type: "interval", unit: "years", n: 10 },
    ];

    for (const r of shapes) {
      expect(typeof recurrenceText(r)).toBe("string");
    }
  });
});
