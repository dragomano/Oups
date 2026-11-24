import { describe, expect, it } from "vitest";
import { calendarDate, calendarTarget, calendarWeeks } from "./calendar";

describe("calendar keyboard navigation", () => {
  const date = calendarDate(2026, 0, 31);

  it("moves across week, month and year boundaries", () => {
    expect(calendarTarget(date, "ArrowRight", false, false)).toEqual(calendarDate(2026, 1, 1));
    expect(calendarTarget(date, "ArrowDown", false, false)).toEqual(calendarDate(2026, 1, 7));
    expect(calendarTarget(date, "Home", false, false)).toEqual(calendarDate(2026, 0, 25));
    expect(calendarTarget(date, "End", false, false)).toEqual(date);
    expect(calendarTarget(calendarDate(2026, 0, 1), "ArrowUp", false, false)).toEqual(
      calendarDate(2025, 11, 25),
    );
  });

  it("follows the visual direction in right-to-left languages", () => {
    expect(calendarTarget(date, "ArrowLeft", false, true)).toEqual(calendarDate(2026, 1, 1));
    expect(calendarTarget(date, "ArrowRight", false, true)).toEqual(calendarDate(2026, 0, 30));
  });

  it("clamps the day when paging by month or year", () => {
    expect(calendarTarget(date, "PageDown", false, false)).toEqual(calendarDate(2026, 1, 28));
    expect(calendarTarget(calendarDate(2024, 1, 29), "PageUp", true, false)).toEqual(
      calendarDate(2023, 1, 28),
    );
    expect(calendarTarget(date, "Tab", false, false)).toBeNull();
  });

  it("lays out six weeks from Sunday through Saturday and preserves early years", () => {
    const weeks = calendarWeeks(2026, 0);
    expect(weeks.map((week) => week.length)).toEqual([7, 7, 7, 7, 7, 7]);
    expect(weeks[0][0]).toEqual(calendarDate(2025, 11, 28));
    expect(weeks[5][6]).toEqual(calendarDate(2026, 1, 7));
    expect(calendarDate(99, 0, 1).getFullYear()).toBe(99);
  });
});
