import type { EndMode, Recurrence } from "./api";

interface ValidationInput {
  title: string;
  startDate: string;
  recurrence: Recurrence;
  endType: EndMode["type"];
  endDate: string;
}

export function validateReminderDraft({
  title,
  startDate,
  recurrence,
  endType,
  endDate,
}: ValidationInput): string {
  if (!title.trim()) return "editor.error_title";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "editor.error_start_date";
  if (recurrence.type === "once") return "";
  if (recurrence.type === "weekly" && recurrence.weekdays.length === 0) return "editor.error_weekdays";
  if (recurrence.type === "monthly" && recurrence.days.length === 0) return "editor.error_days";
  if (endType === "until" && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return "editor.error_date";

  return "";
}
