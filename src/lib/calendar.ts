import { daysInMonth } from "./time";

export function calendarDate(year: number, month: number, day: number): Date {
  // setFullYear also preserves years 1–99, which the Date constructor offsets by 1900.
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month, day);
  return date;
}

export function calendarWeeks(year: number, month: number): Date[][] {
  const first = calendarDate(year, month, 1);
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, column) =>
      calendarDate(year, month, 1 - first.getDay() + row * 7 + column),
    ),
  );
}

export function calendarTarget(date: Date, key: string, shift: boolean, rtl: boolean): Date | null {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const weekday = date.getDay();

  switch (key) {
    case "ArrowLeft":
      return calendarDate(year, month, day + (rtl ? 1 : -1));
    case "ArrowRight":
      return calendarDate(year, month, day + (rtl ? -1 : 1));
    case "ArrowUp":
      return calendarDate(year, month, day - 7);
    case "ArrowDown":
      return calendarDate(year, month, day + 7);
    case "Home":
      return calendarDate(year, month, day - weekday);
    case "End":
      return calendarDate(year, month, day + 6 - weekday);
    case "PageUp":
    case "PageDown": {
      const step = key === "PageUp" ? -1 : 1;
      const target = calendarDate(year, month + step * (shift ? 12 : 1), 1);
      const targetYear = target.getFullYear();
      const targetMonth = target.getMonth();
      return calendarDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth + 1)));
    }
    default:
      return null;
  }
}
