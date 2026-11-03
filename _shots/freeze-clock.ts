/**
 * Freeze the wall clock before anything else runs.
 *
 * Relative labels ("in 3 hours", overdue) are the only part of a screenshot
 * that depends on when it was taken, so the whole gallery is pinned to one
 * moment. This module must stay the FIRST import of an entry point: ES modules
 * are evaluated in import order, and the shared clock reads `Date.now()` while
 * it initialises.
 */

import { PINNED_NOW } from "./config";

const RealDate = Date;
const PINNED = new RealDate(
  PINNED_NOW.year,
  PINNED_NOW.month - 1,
  PINNED_NOW.day,
  PINNED_NOW.hour,
  PINNED_NOW.minute,
  PINNED_NOW.second,
  0,
).getTime();

class FrozenDate extends RealDate {
  // biome-ignore lint/suspicious/noExplicitAny: mirrors the Date overloads
  constructor(...args: any[]) {
    if (args.length === 0) super(PINNED);
    else super(...args);
  }

  static override now(): number {
    return PINNED;
  }
}

globalThis.Date = FrozenDate as DateConstructor;
