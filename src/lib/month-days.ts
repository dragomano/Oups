/** Toggle a monthly occurrence while retaining at least one selected day. */
export function toggleMonthDay(days: number[], day: number): number[] {
  if (days.includes(day)) return days.length === 1 ? [...days] : days.filter((value) => value !== day);
  return [...days, day].sort((a, b) => a - b);
}
