import { describe, expect, it } from "vitest";
import { toggleMonthDay } from "./month-days";

describe("toggleMonthDay", () => {
  it("keeps the final selected occurrence", () => {
    expect(toggleMonthDay([5], 5)).toEqual([5]);
  });

  it("adds days in calendar order without changing the source", () => {
    const days = [5, 20];
    expect(toggleMonthDay(days, 12)).toEqual([5, 12, 20]);
    expect(days).toEqual([5, 20]);
  });

  it("removes one occurrence and can select the last day", () => {
    expect(toggleMonthDay([5, 20], 5)).toEqual([20]);
    expect(toggleMonthDay([20], 31)).toEqual([20, 31]);
  });
});
