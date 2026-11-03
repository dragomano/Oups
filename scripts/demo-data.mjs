// Generates the demo templates in demo/*.json.
//
// Scheduling dates in these files are RELATIVE ("+2h", "-6d19h", "-30d"): the
// app's JSON import materializes them against the import moment
// (commands.rs -> insert_imported -> relative::resolve_reminder), so a checkout
// of any age imports as the same live dataset. Absolute timestamps would decay:
// the importer recomputes `next_due` from the recurrence rule only, and a
// one-shot whose start has passed fires on the first scheduler tick, pops up
// and lands in "Completed".
//
//   pnpm demo
//
// (The package script runs this generator and then `biome check --write demo`,
// so the generated files match the repo's formatting out of the box.)
//
// Only needed when the dataset content changes (titles, notes, rules) — the
// dates never need a refresh. RU and EN are written from one definition, so
// they cannot drift apart.
//
// Every active reminder is anchored so its next occurrence is in the future at
// import time: recurring rules start in the past and are self-correcting,
// one-shot rules start at the target moment.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "demo");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Local wall-clock "YYYY-MM-DDTHH:MM:SS" — the format the app stores. */
function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** Monday = 1 .. Sunday = 7, matching the app's weekday numbering. */
function weekday(d) {
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Millisecond delta as a relative offset for the importer: "+2h", "-6d19h",
 * "-30d". Days, hours, minutes, in that order — see src-tauri/src/relative.rs,
 * which resolves the offset against the moment of import.
 */
function rel(ms) {
  let minutes = Math.round(Math.abs(ms) / 60_000);
  const days = Math.floor(minutes / 1440);
  minutes -= days * 1440;
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  let out = ms < 0 ? "-" : "+";
  if (days) out += `${days}d`;
  if (hours) out += `${hours}h`;
  if (minutes || out.length === 1) out += `${minutes}m`;
  return out;
}

/**
 * One reminder whose NEXT occurrence is `inMs` after the import moment.
 *
 * The rule is anchored backwards from that moment: a daily rule starts a day
 * earlier, a weekly one on the same weekday a week earlier, an interval one a
 * full period earlier. Recurrences therefore keep resolving to the future on
 * every import, instead of rotting the way a fixed timestamp would.
 */
function reminder(spec, baseMs) {
  const next = new Date(baseMs + spec.in);
  let start = next;
  // No rule means one-shot, matching the model's default.
  let recurrence = spec.recurrence ?? { type: "once" };

  if (recurrence.type === "daily") {
    start = new Date(next.getTime() - DAY);
  } else if (recurrence.type === "interval") {
    const units = {
      minutes: 60_000,
      hours: HOUR,
      days: DAY,
      weeks: 7 * DAY,
      months: 30 * DAY,
      years: 365 * DAY,
    };
    start = new Date(next.getTime() - units[recurrence.unit] * recurrence.n);
  } else if (recurrence.type === "weekly") {
    start = new Date(next.getTime() - 7 * DAY);
    recurrence = { type: "weekly", weekdays: [weekday(next)] };
  } else if (recurrence.type === "monthly") {
    start = new Date(next.getTime() - 30 * DAY);
    recurrence = { type: "monthly", days: [next.getDate()] };
  } else if (recurrence.type === "yearly") {
    start = new Date(next.getTime() - 365 * DAY);
    recurrence = { type: "yearly", month: next.getMonth() + 1, day: next.getDate() };
  }

  return {
    id: "",
    title: spec.title,
    note: spec.note ?? "",
    priority: spec.priority ?? "normal",
    startAt: rel(start.getTime() - baseMs),
    recurrence,
    endMode: { type: "never" },
    firedCount: 0,
    nextDue: rel(spec.in),
    enabled: true,
    completed: false,
    createdAt: rel(-30 * DAY),
    updatedAt: "",
  };
}

const h = (n) => n * HOUR;
const d = (n) => n * DAY;

// Shared shape: the same twelve active reminders in both languages, arranged so
// all four Eisenhower quadrants are populated. `id` stays empty on purpose —
// the importer assigns fresh ids, so importing twice cannot overwrite rows.
const SPEC = [
  // Urgent + important
  {
    priority: "critical",
    in: h(3),
    recurrence: { type: "interval", unit: "hours", n: 12 },
    noteKey: "drafts",
  },
  { priority: "high", in: h(5), recurrence: { type: "weekly" } },
  { priority: "critical", in: h(9), recurrence: { type: "interval", unit: "hours", n: 24 } },
  // Urgent, not important
  { priority: "normal", in: h(2) },
  { priority: "normal", in: h(11), recurrence: { type: "daily" } },
  // Important, not urgent
  { priority: "high", in: d(3) },
  { priority: "high", in: d(7), recurrence: { type: "monthly" } },
  { priority: "high", in: d(16), recurrence: { type: "interval", unit: "days", n: 30 } },
  { priority: "critical", in: d(2), recurrence: { type: "yearly" } },
  // Not urgent, not important
  { priority: "low", in: d(5) },
  { priority: "low", in: d(9), recurrence: { type: "interval", unit: "days", n: 14 } },
  { priority: "normal", in: d(6), recurrence: { type: "monthly" } },
];

const COPY = {
  ru: {
    note: "Черновики лежат в общей папке",
    titles: [
      "Отчёт по кварталу",
      "Позвонить в налоговую",
      "Резервная копия 1С",
      "Ответить Саше в чате",
      "Вынести мусор",
      "Планировать следующий квартал",
      "Обновить резервные копии",
      "Записаться к стоматологу",
      "Провести стратегическую сессию",
      "Посмотреть новый сериал",
      "Почитать про садоводство",
      "Оплатить интернет",
    ],
    done: ["Сдать отчёт в бухгалтерию", "Купить подарок на день рождения", "Обновить драйверы видеокарты"],
  },
  en: {
    note: "Drafts are in the shared folder",
    titles: [
      "Quarterly report",
      "Call the tax office",
      "Back up the 1C database",
      "Reply to Sasha in chat",
      "Take out the trash",
      "Plan next quarter",
      "Refresh the backups",
      "Book a dentist appointment",
      "Run the strategy session",
      "Watch the new series",
      "Read about gardening",
      "Pay the internet bill",
    ],
    done: ["Submit the report to accounting", "Buy a birthday present", "Update the graphics drivers"],
  },
};

function dataset(lang) {
  const copy = COPY[lang];
  // One base moment per run; the fields below are offsets, and `exportedAt`
  // records it for reference only — the importer re-anchors them anyway.
  const baseMs = Date.now();
  const reminders = SPEC.map((spec, i) =>
    reminder(
      {
        ...spec,
        title: copy.titles[i],
        note: spec.noteKey ? copy.note : "",
      },
      baseMs,
    ),
  );
  return {
    version: 1,
    exportedAt: stamp(new Date(baseMs)),
    reminders,
  };
}

// The importer resets `completed` to false, so finished items are listed here
// only as a reference for re-creating the "Completed" view by hand.
mkdirSync(outDir, { recursive: true });
for (const lang of Object.keys(COPY)) {
  const file = join(outDir, `reminders.${lang}.json`);
  writeFileSync(file, `${JSON.stringify(dataset(lang), null, 2)}\n`, "utf8");
  console.log(`demo/reminders.${lang}.json`);
}
