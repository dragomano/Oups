import { describe, expect, it } from "vitest";
import { validateReminderDraft } from "./editor-validation";

const valid: Parameters<typeof validateReminderDraft>[0] = {
  title: "Reminder",
  startDate: "2026-10-15",
  recurrence: { type: "once" },
  endType: "never",
  endDate: "",
};

describe("validateReminderDraft", () => {
  it.each(["", " ", "\t\n"])("rejects an empty or whitespace-only title: %j", (title) => {
    expect(validateReminderDraft({ ...valid, title })).toBe("editor.error_title");
  });

  it("accepts a nonempty title with surrounding whitespace", () => {
    expect(validateReminderDraft({ ...valid, title: " Reminder " })).toBe("");
  });

  it("reports the title before errors in later fields", () => {
    expect(
      validateReminderDraft({
        ...valid,
        title: "",
        recurrence: { type: "weekly", weekdays: [] },
      }),
    ).toBe("editor.error_title");
  });

  it("keeps recurrence errors after the title is corrected", () => {
    expect(validateReminderDraft({ ...valid, recurrence: { type: "weekly", weekdays: [] } })).toBe(
      "editor.error_weekdays",
    );
    expect(validateReminderDraft({ ...valid, recurrence: { type: "monthly", days: [] } })).toBe(
      "editor.error_days",
    );
    expect(validateReminderDraft({ ...valid, recurrence: { type: "weekly", weekdays: [1] } })).toBe("");
    expect(validateReminderDraft({ ...valid, recurrence: { type: "monthly", days: [15] } })).toBe("");
  });

  it("requires a start date", () => {
    expect(validateReminderDraft({ ...valid, startDate: "" })).toBe("editor.error_start_date");
  });

  it("ignores hidden end rules for a one-shot reminder", () => {
    expect(validateReminderDraft({ ...valid, endType: "until" })).toBe("");
  });

  it("requires an end date only for the until mode", () => {
    const recurring = { ...valid, recurrence: { type: "daily" } as const };
    expect(validateReminderDraft({ ...recurring, endType: "until" })).toBe("editor.error_date");
    expect(validateReminderDraft({ ...recurring, endType: "until", endDate: "15.10.2026" })).toBe(
      "editor.error_date",
    );
    expect(validateReminderDraft({ ...recurring, endType: "until", endDate: "2026-10-15" })).toBe("");
    expect(validateReminderDraft({ ...recurring, endType: "afterCount" })).toBe("");
  });
});
