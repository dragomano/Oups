import type { Priority, Reminder } from "./api";
import { parseLocal } from "./time";

/**
 * Eisenhower matrix: a reminder lands in a quadrant from one axis.
 *
 * Importance is the only input — the priority the user picked, or set by
 * dragging the card to another quadrant. The schedule plays no part: a
 * reminder five years out can be the most important thing on the board.
 */

export type Quadrant = "do" | "delegate" | "schedule" | "drop";

/** Reading order, matching the 2×2 grid top-left → bottom-right. */
export const QUADRANTS: readonly Quadrant[] = ["do", "delegate", "schedule", "drop"];

/** Overdue or due within 24 hours — used for ordering and the due label. */
export const URGENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DueKind = "overdue" | "soon" | "later";

/** The "important" half of the matrix. */
export function isImportant(priority: Priority): boolean {
  return priority === "high" || priority === "critical";
}

/** One priority level per quadrant, most important first. */
const BY_PRIORITY: Record<Priority, Quadrant> = {
  critical: "do",
  high: "schedule",
  normal: "delegate",
  low: "drop",
};

/** The priority a reminder needs to sit in a given quadrant. */
export function priorityForQuadrant(quadrant: Quadrant): Priority {
  const found = (Object.keys(BY_PRIORITY) as Priority[]).find((p) => BY_PRIORITY[p] === quadrant);

  return found ?? "normal";
}

/** A reminder without a next run has no due date to show. */
export function dueKind(nextDue: string | null | undefined, now: number): DueKind {
  const d = parseLocal(nextDue);

  if (!d) return "later";

  const delta = d.getTime() - now;

  if (delta <= 0) return "overdue";

  return delta <= URGENT_WINDOW_MS ? "soon" : "later";
}

export function isUrgent(nextDue: string | null | undefined, now: number): boolean {
  return dueKind(nextDue, now) !== "later";
}

export function quadrantOf(r: Reminder): Quadrant {
  return BY_PRIORITY[r.priority];
}

export type Quadrants = Record<Quadrant, Reminder[]>;

export function emptyQuadrants(): Quadrants {
  return { do: [], delegate: [], schedule: [], drop: [] };
}

/**
 * Split reminders into quadrants. Inside a quadrant they are ordered by the
 * next run, so overdue items surface first and dateless ones sink to the end.
 */
export function groupByQuadrant(reminders: Reminder[], now: number): Quadrants {
  const out = emptyQuadrants();

  for (const r of reminders) {
    out[quadrantOf(r)].push(r);
  }

  for (const q of QUADRANTS) {
    out[q].sort((a, b) => compareByDue(a, b, now));
  }

  return out;
}

/** Overdue first, then by next run; reminders without a next run sink to the end. */
function compareByDue(a: Reminder, b: Reminder, now: number): number {
  const da = parseLocal(a.nextDue);
  const db = parseLocal(b.nextDue);

  if (!da || !db) {
    if (da === db) return 0;

    return da ? -1 : 1;
  }

  const overdueA = da.getTime() <= now;
  const overdueB = db.getTime() <= now;

  if (overdueA !== overdueB) return overdueA ? -1 : 1;

  return da.getTime() - db.getTime();
}

/** Reminders the matrix shows: the same set as the "Active" view. */
export function isActive(r: Reminder): boolean {
  return !r.completed && r.enabled;
}

export function activeReminders(reminders: Reminder[]): Reminder[] {
  return reminders.filter(isActive);
}
