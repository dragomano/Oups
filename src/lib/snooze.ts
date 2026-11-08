import type { SnoozeUnit } from "./api";
import { declinedWord } from "./time";

export const SNOOZE_MIN = 1;
export const SNOOZE_MAX = 9999;
export const SNOOZE_DEFAULT = 5;
export const SNOOZE_UNITS = ["minutes", "hours", "days", "weeks", "months"] as const;

export function isValidSnoozeCount(count: number | undefined): count is number {
  return typeof count === "number" && Number.isInteger(count) && count >= SNOOZE_MIN && count <= SNOOZE_MAX;
}

/** Standalone unit nouns can have a different case from recurrence phrases. */
export function snoozeUnitLabel(unit: SnoozeUnit, count: number | undefined): string {
  return declinedWord(`popup.snooze_units.${unit}`, isValidSnoozeCount(count) ? count : SNOOZE_DEFAULT);
}
