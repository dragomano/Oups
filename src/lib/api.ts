import { invoke } from "@tauri-apps/api/core";

export type Priority = "low" | "normal" | "high" | "critical";
/** Main-window view tabs. */
export type View = "active" | "done" | "matrix";
export type IntervalUnit = "minutes" | "hours" | "days" | "weeks" | "months" | "years";

export type Recurrence =
  | { type: "once" }
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] }
  | { type: "monthly"; days: number[] }
  | { type: "yearly"; month: number; day: number }
  | { type: "interval"; unit: IntervalUnit; n: number };

export type EndMode = { type: "never" } | { type: "afterCount"; n: number } | { type: "until"; date: string };

export interface Reminder {
  id: string;
  title: string;
  note: string;
  priority: Priority;
  /** Local wall-clock time of the first occurrence, "YYYY-MM-DDTHH:MM:SS". */
  startAt: string;
  recurrence: Recurrence;
  endMode: EndMode;
  firedCount: number;
  nextDue: string | null;
  enabled: boolean;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsView {
  language: string;
  closeToTray: boolean;
  autostartEnabled: boolean;
  theme: string;
  accent: string;
  popupCorner: string;
}

export type PopupData = { kind: "single"; reminder: Reminder } | { kind: "missed"; reminders: Reminder[] };
/** Caption button actions for the frameless main window. */
export type WindowControl = "minimize" | "toggle-maximize" | "close";

export interface LocaleInfo {
  code: string;
  name: string;
}

export const api = {
  mainWindowReady: () => invoke<void>("main_window_ready"),
  popupWindowReady: () => invoke<void>("popup_window_ready"),
  windowControl: (action: WindowControl) => invoke<void>("window_control", { action }),
  windowMaximized: () => invoke<boolean>("window_maximized"),
  /** Whether the system material (Mica) shows behind the main window. */
  windowBackdrop: () => invoke<boolean>("window_backdrop"),
  /** The app's display name (productName), not translatable. */
  appName: () => invoke<string>("app_name"),

  /** Opens a link from a note in the system handler (browser / mail client). */
  openExternal: (url: string) => invoke<void>("open_external", { url }),
  openSettings: () => invoke<void>("open_settings"),
  fitSettingsWindow: (height: number) => invoke<void>("fit_settings_window", { height }),
  openEditor: (reminder: Reminder | null = null, duplicate = false) =>
    invoke<void>("open_editor", { reminder, duplicate }),
  getEditorReminder: () => invoke<Reminder | null>("get_editor_reminder"),
  fitEditorWindow: (height: number) => invoke<void>("fit_editor_window", { height }),
  listReminders: () => invoke<Reminder[]>("list_reminders"),
  upsertReminder: (reminder: Reminder) => invoke<Reminder>("upsert_reminder", { reminder }),
  deleteReminder: (id: string) => invoke<void>("delete_reminder", { id }),
  setEnabled: (id: string, enabled: boolean) => invoke<Reminder>("set_reminder_enabled", { id, enabled }),
  setCompleted: (id: string, completed: boolean) =>
    invoke<Reminder>("set_reminder_completed", { id, completed }),
  snooze: (id: string, minutes: number) => invoke<void>("snooze_reminder", { id, minutes }),
  snoozeMissedAll: (minutes: number) => invoke<void>("snooze_missed_all", { minutes }),
  getPopupData: () => invoke<PopupData>("get_popup_data"),
  dismissMissed: () => invoke<void>("dismiss_missed"),
  dismissMissedOne: (id: string) => invoke<void>("dismiss_missed_one", { id }),
  getSettings: () => invoke<SettingsView>("get_settings"),
  setSettings: (settings: {
    language: string;
    closeToTray: boolean;
    theme: string;
    accent: string;
    popupCorner: string;
  }) => invoke<void>("set_settings", { settings }),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  getLocale: (lang: string) => invoke<Record<string, unknown>>("get_locale", { lang }),
  listLocales: () => invoke<LocaleInfo[]>("list_locales"),
  exportReminders: (path: string) => invoke<number>("export_reminders", { path }),
  importReminders: (path: string) => invoke<number>("import_reminders", { path }),
};
