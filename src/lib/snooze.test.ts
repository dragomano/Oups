import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "./i18n.svelte";
import { isValidSnoozeCount, SNOOZE_DEFAULT, SNOOZE_UNITS, snoozeUnitLabel } from "./snooze";
import { formatUnit } from "./time";

function useLocale(code: string) {
  i18n.lang = code;
  i18n.dict = JSON.parse(readFileSync(join(__dirname, "..", "..", "locales", `${code}.json`), "utf8"));
}

describe("snooze count", () => {
  it("starts at five and accepts both inclusive bounds", () => {
    expect(SNOOZE_DEFAULT).toBe(5);
    for (const count of [1, 5, 9999]) expect(isValidSnoozeCount(count)).toBe(true);
  });

  it("rejects empty, fractional, non-finite, and out-of-range values", () => {
    for (const count of [undefined, 0, -1, 1.5, 9999.5, 10000, Number.NaN, Infinity, -Infinity]) {
      expect(isValidSnoozeCount(count)).toBe(false);
    }
  });
});

describe("snooze unit labels", () => {
  beforeEach(() => useLocale("ru"));

  it.each<[number, string[]]>([
    [1, ["минута", "час", "день", "неделя", "месяц"]],
    [2, ["минуты", "часа", "дня", "недели", "месяца"]],
    [5, ["минут", "часов", "дней", "недель", "месяцев"]],
    [11, ["минут", "часов", "дней", "недель", "месяцев"]],
    [14, ["минут", "часов", "дней", "недель", "месяцев"]],
    [21, ["минута", "час", "день", "неделя", "месяц"]],
    [22, ["минуты", "часа", "дня", "недели", "месяца"]],
    [111, ["минут", "часов", "дней", "недель", "месяцев"]],
    [9999, ["минут", "часов", "дней", "недель", "месяцев"]],
  ])("declines all five Russian units for %i", (count, expected) => {
    expect(SNOOZE_UNITS.map((unit) => snoozeUnitLabel(unit, count))).toEqual(expected);
  });

  it("keeps standalone nouns separate from recurrence cases", () => {
    expect(snoozeUnitLabel("minutes", 1)).toBe("минута");
    expect(formatUnit("minutes", 1)).toBe("минуту");
    expect(snoozeUnitLabel("weeks", 1)).toBe("неделя");
    expect(formatUnit("weeks", 1)).toBe("неделю");
    useLocale("uk");
    expect(snoozeUnitLabel("minutes", 1)).toBe("хвилина");
    expect(snoozeUnitLabel("hours", 1)).toBe("година");
  });

  it("follows the loaded locale's plural rules", () => {
    useLocale("en");
    expect(snoozeUnitLabel("months", 1)).toBe("month");
    expect(snoozeUnitLabel("months", 2)).toBe("months");
    useLocale("pl");
    expect(snoozeUnitLabel("minutes", 1)).toBe("minuta");
    expect(snoozeUnitLabel("weeks", 2)).toBe("tygodnie");
    expect(snoozeUnitLabel("weeks", 5)).toBe("tygodni");
    useLocale("ar");
    expect(snoozeUnitLabel("months", 2)).toBe("شهران");
    expect(snoozeUnitLabel("months", 5)).toBe("أشهر");
    expect(snoozeUnitLabel("months", 15)).toBe("شهرًا");
  });

  it("keeps labels usable while the count is empty or invalid", () => {
    for (const count of [undefined, Number.NaN, 0, 1.5, 10000]) {
      expect(snoozeUnitLabel("minutes", count)).toBe("минут");
    }
  });
});
