import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clock, startClock, TICK_MS } from "./clock.svelte";

/**
 * The clock only ever calls add/removeEventListener on its targets, so the DOM
 * can stand in as a bare event registry — no jsdom needed (the Vitest
 * environment is node).
 */
const listeners = new Map<string, Set<() => void>>();

const target = {
  addEventListener: (type: string, cb: () => void) => {
    const set = listeners.get(type) ?? new Set();

    set.add(cb);
    listeners.set(type, set);
  },
  removeEventListener: (type: string, cb: () => void) => {
    listeners.get(type)?.delete(cb);
  },
};

function fire(type: string) {
  for (const cb of listeners.get(type) ?? []) cb();
}

describe("clock", () => {
  const base = new Date(2026, 9, 12, 10, 0, 0).getTime();
  let systemNow = base;

  beforeEach(() => {
    listeners.clear();
    vi.useFakeTimers();
    vi.stubGlobal("window", target);
    vi.stubGlobal("document", target);
    systemNow = base;

    // Freezing Date.now() keeps every expectation free of real-time drift.
    vi.spyOn(Date, "now").mockImplementation(() => systemNow);
    clock.now = base;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("advances the clock when the interval fires", () => {
    const stop = startClock();

    systemNow = base + 10 * 60000;
    vi.advanceTimersByTime(TICK_MS);

    expect(clock.now).toBe(base + 10 * 60000);
    stop();
  });

  it("resyncs as soon as the window regains focus or becomes visible", () => {
    const stop = startClock();

    systemNow = base + 6 * 60 * 60000;
    fire("focus");
    expect(clock.now).toBe(base + 6 * 60 * 60000);

    systemNow = base + 7 * 60 * 60000;
    fire("visibilitychange");
    expect(clock.now).toBe(base + 7 * 60 * 60000);

    stop();
  });

  it("stops advancing once the returned disposer ran", () => {
    const stop = startClock();

    stop();
    systemNow = base + 120000;
    vi.advanceTimersByTime(TICK_MS * 5);

    expect(clock.now).toBe(base);
  });
});
