/**
 * A faithful port of the import path, so the screenshots show the app with the
 * demo dataset exactly as a user would see it right after "Import".
 *
 *   demo/reminders.<lang>.json
 *     -> relative::resolve_reminder   (offsets -> absolute wall clock)
 *     -> initial_next_due             (next occurrence the rule has left)
 *
 * Chrono works on naive local time, so the arithmetic below runs on "naive"
 * milliseconds (the wall-clock fields reinterpreted as UTC) rather than on real
 * instants. That keeps a DST switch from shifting an occurrence by an hour,
 * exactly like the Rust side.
 */

import en from "../demo/reminders.en.json";
import ru from "../demo/reminders.ru.json";
import type { EndMode, Priority, Recurrence, Reminder } from "../src/lib/api";
import { PINNED_NOW } from "./config";

const PIN_MS = (() => {
  const { year, month, day, hour, minute, second } = PINNED_NOW;

  return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
})();

type DemoReminder = {
  id: string;
  title: string;
  note: string;
  priority: Priority;
  startAt: string;
  recurrence: Recurrence;
  endMode: EndMode;
  firedCount: number;
  nextDue: string | null;
  enabled: boolean;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

const DEMO: Record<string, { reminders: DemoReminder[] }> = { en, ru };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/* ---------------------------------------------------------------- wall clock */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock "YYYY-MM-DDTHH:MM:SS" — the format the app stores. */
export function stamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Wall-clock fields as UTC fields: a DST-free timeline we can do math on. */
const naive = (ms: number) => {
  const d = new Date(ms);

  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
};

/** Inverse of `naive`: back to a real local Date the UI can format. */
const real = (n: number) => {
  const d = new Date(n);

  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
};

const days = (n: number, offset: number) => {
  const d = new Date(n);

  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + offset,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
};

const dayOf = (n: number) => {
  const d = new Date(n);

  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Monday = 1 .. Sunday = 7, matching the app's weekday numbering. */
const weekday = (n: number) => ((new Date(n).getUTCDay() + 6) % 7) + 1;

const daysInMonth = (year: number, month: number) =>
  month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

/** Day-of-month clamped to the month's length: the 31st fires on Feb 28. */
const clampDay = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, Math.min(Math.max(day, 1), daysInMonth(year, month)));

const addMonths = (dateN: number, months: number) => {
  const d = new Date(dateN);
  const index = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;

  return clampDay(Math.floor(index / 12), (index % 12) + 1, d.getUTCDate());
};

/* ------------------------------------------------- relative::parse_offset */

const OFFSET = /^([+-])(\d+d)?(\d+h)?(\d+m)?$/;

/** "+2h", "-6d19h", "+45m" — sign plus d/h/m components in that order. */
export function parseOffset(value: string): number | null {
  const m = OFFSET.exec(value);

  if (!m || value === "+" || value === "-") return null;

  const [, sign, d, h, min] = m;

  if (!d && !h && !min) return null;

  const total =
    (d ? Number.parseInt(d, 10) * DAY : 0) +
    (h ? Number.parseInt(h, 10) * HOUR : 0) +
    (min ? Number.parseInt(min, 10) * MINUTE : 0);

  return sign === "-" ? -total : total;
}

/** Materialize one field; absolute stamps are left alone, like the Rust side. */
function resolveField(value: string, nowMs: number): string {
  const offset = parseOffset(value);

  return offset === null ? value : stamp(real(naive(nowMs) + offset));
}

const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

const parseStamp = (value: string): number | null => {
  const m = STAMP.exec(value);

  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
};

/* ------------------------------------------------- recurrence::next_after */

function nextAfter(start: number, rec: Recurrence, after: number): number | null {
  if (start > after) return start;

  const s = new Date(start);
  const time = [s.getUTCHours(), s.getUTCMinutes(), s.getUTCSeconds()] as const;
  const at = (dateN: number) => new Date(dateN).setUTCHours(...time);
  const yearOf = (n: number) => new Date(n).getUTCFullYear();
  const monthOf = (n: number) => new Date(n).getUTCMonth();

  switch (rec.type) {
    case "once":
      return null;

    case "daily": {
      const cand = at(dayOf(after));

      return cand <= after ? at(days(after, 1)) : cand;
    }

    case "weekly": {
      if (rec.weekdays.length === 0) return null;

      for (let offset = 0; offset < 14; offset++) {
        const d = days(after, offset);

        if (!rec.weekdays.includes(weekday(d))) continue;

        const cand = at(d);

        if (cand > after) return cand;
      }

      return null;
    }

    case "monthly": {
      if (rec.days.length === 0) return null;

      const baseIndex = yearOf(after) * 12 + monthOf(after);

      for (let m = 0; m <= 25; m++) {
        const index = baseIndex + m;
        let best: number | null = null;

        for (const day of rec.days) {
          const cand = at(clampDay(Math.floor(index / 12), (index % 12) + 1, day));

          if (cand > after && (best === null || cand < best)) best = cand;
        }

        if (best !== null) return best;
      }

      return null;
    }

    case "yearly": {
      for (let y = yearOf(after); y <= yearOf(after) + 200; y++) {
        const cand = at(clampDay(y, rec.month, rec.day));

        if (cand > after) return cand;
      }

      return null;
    }

    case "interval": {
      const n = Math.max(1, rec.n);

      if (rec.unit !== "months" && rec.unit !== "years") {
        const secs = { minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[rec.unit] * n;
        const elapsed = Math.floor((after - start) / 1000);

        return start + (Math.floor(elapsed / secs) + 1) * secs * 1000;
      }

      const step = rec.unit === "years" ? 12 * n : n;
      let m = Math.max(
        0,
        Math.trunc((yearOf(after) * 12 + monthOf(after) - (yearOf(start) * 12 + monthOf(start))) / step),
      );

      for (let guard = 0; guard <= 2400; guard++) {
        const cand = at(addMonths(dayOf(start), step * m));

        if (cand > after) return cand;
        m += 1;
      }

      return null;
    }
  }
}

/** scheduler::initial_next_due, end mode included. */
function initialNextDue(r: Reminder, nowMs: number): string | null {
  if (!r.enabled || r.completed) return null;

  const start = parseStamp(r.startAt);

  if (start === null) return null;

  const now = naive(nowMs);
  const next = r.recurrence.type === "once" ? start : nextAfter(start, r.recurrence, now);

  if (next === null) return null;

  if (r.endMode.type === "until" && stamp(real(next)).slice(0, 10) > r.endMode.date) return null;

  if (r.endMode.type === "afterCount" && r.firedCount >= r.endMode.n) return null;

  return stamp(real(next));
}

/* ------------------------------------------------------------ the datasets */

let counter = 0;

function build(source: DemoReminder, lang: string, patch: Partial<Reminder> = {}): Reminder {
  const r: Reminder = {
    ...source,
    // The importer assigns fresh ids, so importing twice cannot overwrite rows.
    id: `${lang}-${(counter++).toString().padStart(3, "0")}`,
    startAt: resolveField(source.startAt, PIN_MS),
    createdAt: resolveField(source.createdAt, PIN_MS),
    nextDue: null,
    ...patch,
  };

  return { ...r, nextDue: initialNextDue(r, PIN_MS) };
}

/** The twelve imported reminders, anchored exactly as the importer anchors them. */
export function activeReminders(lang: string): Reminder[] {
  return DEMO[lang].reminders.map((r) => build(r, lang));
}

/**
 * Finished rows for the "Completed" tab. `completed` and `enabled` are the two
 * fields the JSON reader deliberately resets, so they are set here instead;
 * titles and priorities come from the demo generator's `done` list.
 */
export function completedReminders(lang: string): Reminder[] {
  const copy: Record<string, { title: string; priority: Priority; completed: boolean; enabled: boolean }[]> =
    {
      ru: [
        { title: "Сдать отчёт в бухгалтерию", priority: "normal", completed: true, enabled: true },
        { title: "Купить подарок на день рождения", priority: "high", completed: true, enabled: true },
        { title: "Обновить драйверы видеокарты", priority: "low", completed: true, enabled: true },
        { title: "Старая задача по бэкапу", priority: "normal", completed: false, enabled: false },
      ],
      en: [
        { title: "Submit the report to accounting", priority: "normal", completed: true, enabled: true },
        { title: "Buy a birthday present", priority: "high", completed: true, enabled: true },
        { title: "Update the graphics drivers", priority: "low", completed: true, enabled: true },
        { title: "Old backup job", priority: "normal", completed: false, enabled: false },
      ],
    };
  // Finished things are one-off jobs, so they keep the default rule rather than
  // the first demo reminder's.
  const template: DemoReminder = { ...DEMO[lang].reminders[0], recurrence: { type: "once" } };

  return copy[lang].map(({ title, priority, completed, enabled }) =>
    build({ ...template, title, note: "", priority }, lang, { completed, enabled }),
  );
}

/**
 * The popup window's own reminders. A reminder the scheduler has just fired is
 * already advanced, so `nextDue` holds a moment behind the clock.
 */
export function popupReminders(lang: string, kind: "single" | "missed"): Reminder[] {
  const active = activeReminders(lang);
  const missed = (r: Reminder, minutesAgo: number) => ({
    ...r,
    nextDue: stamp(real(naive(PIN_MS) - minutesAgo * MINUTE)),
  });

  if (kind === "single") return [active[0]];

  return [missed(active[0], 120), missed(active[1], 60), missed(active[11], 300), missed(active[4], 1500)];
}
