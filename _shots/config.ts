/**
 * The one moment the whole gallery is pinned to.
 *
 * Relative labels ("in 3 hours", overdue chips) are the only part of a
 * screenshot that depends on when it was taken, so freezing `Date.now()` here
 * keeps them reproducible. Everything geometric lives in `geometry.mjs`, which
 * the capture driver reads too.
 */

export const PINNED_NOW = { year: 2026, month: 10, day: 11, hour: 17, minute: 2, second: 0 };
