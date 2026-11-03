/**
 * Shared UI clock.
 *
 * Relative labels ("next run in 23 hours") and the matrix's urgency checks are
 * derived from the current moment, but nothing else in the store changes while
 * a window sits open — so they used to refresh only when the reminder list was
 * reloaded. Every consumer now derives from this clock instead.
 */

/**
 * How often the clock advances. Nothing on screen is finer than a minute, so
 * 30 s keeps every label within half a minute of the truth: invisible to the
 * user, negligible to run for a whole session.
 */
export const TICK_MS = 30_000;

export const clock = $state<{ now: number }>({ now: Date.now() });

/** Align the clock with the wall clock right now. */
export function tick() {
  clock.now = Date.now();
}

/**
 * Start the shared clock and return a stop function. Webviews throttle timers
 * while the window is minimized or hidden and skip them entirely across system
 * sleep, so regaining focus resyncs immediately instead of waiting for the
 * next tick.
 */
export function startClock(): () => void {
  const id = setInterval(tick, TICK_MS);

  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);

  return () => {
    clearInterval(id);
    window.removeEventListener("focus", tick);
    document.removeEventListener("visibilitychange", tick);
  };
}
