import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Priority, Recurrence, Reminder } from "./api";

/**
 * The files in demo/ are imported through the app's own JSON reader
 * (commands.rs::import_reminders), so they have to keep matching the shapes
 * serde expects. A drift here silently drops records — the importer skips
 * anything that fails to parse — which is why it is worth a test.
 *
 * Scheduling dates in these files are relative ("+2h", "-6d19h"): the importer
 * materializes them against the moment of import, which is what keeps a
 * checkout of any age importable as a live dataset. The behavioural checks
 * (everything lands in the future, quadrants stay populated) run in
 * commands.rs, next to the real resolution code.
 */

type DemoFile = { version: number; exportedAt: string; reminders: Reminder[] };

const PRIORITIES: Priority[] = ["low", "normal", "high", "critical"];
const UNITS = ["minutes", "hours", "days", "weeks", "months", "years"];
const ABSOLUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const RELATIVE = /^[+-](\d+d)?(\d+h)?(\d+m)?$/;

/** `"+2h"` / `"-6d19h"` / `"-30d"` — see src-tauri/src/relative.rs. */
function isRelative(value: string): boolean {
  return value.length > 1 && RELATIVE.test(value);
}

function load(lang: "ru" | "en"): DemoFile {
  const path = join(__dirname, "..", "..", "demo", `reminders.${lang}.json`);

  return JSON.parse(readFileSync(path, "utf8")) as DemoFile;
}

function isRecurrence(r: Recurrence): boolean {
  switch (r.type) {
    case "once":
    case "daily":
      return true;
    case "weekly":
      return r.weekdays.length > 0 && r.weekdays.every((w) => w >= 1 && w <= 7);
    case "monthly":
      return r.days.length > 0 && r.days.every((d) => d >= 1 && d <= 31);
    case "yearly":
      return r.month >= 1 && r.month <= 12 && r.day >= 1 && r.day <= 31;
    case "interval":
      return (UNITS as string[]).includes(r.unit) && r.n >= 1;
  }
}

describe.each(["ru", "en"] as const)("demo/reminders.%s.json", (lang) => {
  const file = load(lang);

  it("uses the native export envelope", () => {
    expect(file.version).toBe(1);
    expect(file.exportedAt).toMatch(ABSOLUTE);
    expect(Array.isArray(file.reminders)).toBe(true);
    expect(file.reminders.length).toBeGreaterThan(0);
  });

  it("only uses fields the importer accepts", () => {
    for (const r of file.reminders) {
      expect(typeof r.title).toBe("string");
      expect(r.title.length).toBeGreaterThan(0);
      expect(ABSOLUTE.test(r.startAt) || isRelative(r.startAt), r.title).toBe(true);
      expect(PRIORITIES).toContain(r.priority);
      expect(isRecurrence(r.recurrence)).toBe(true);
      expect(r.endMode.type).toBe("never");
    }
  });

  it("keeps every scheduling date relative so the dataset never goes stale", () => {
    // Absolute timestamps would rot in the repository: the next occurrence is
    // in the future only relative to the moment the file was written. The
    // importer resolves these offsets at import time instead (relative.rs).
    for (const r of file.reminders) {
      expect(isRelative(r.startAt), r.title).toBe(true);
      expect(isRelative(r.nextDue as string), r.title).toBe(true);
      expect(isRelative(r.createdAt), r.title).toBe(true);
    }
  });

  it("leaves ids empty so a second import cannot overwrite rows", () => {
    for (const r of file.reminders) {
      expect(r.id).toBe("");
    }
  });
});

describe("demo dataset translations", () => {
  it("keeps the same shape in both languages", () => {
    const ru = load("ru");
    const en = load("en");
    expect(en.reminders).toHaveLength(ru.reminders.length);
    expect(en.reminders.map((r) => r.priority)).toEqual(ru.reminders.map((r) => r.priority));
  });

  it("uses different, non-interchangeable titles per language", () => {
    const ru = load("ru").reminders.map((r) => r.title);
    const en = load("en").reminders.map((r) => r.title);
    expect(ru.filter((t) => en.includes(t))).toEqual([]);
  });
});
