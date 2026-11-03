/**
 * Stubs for the Tauri bridge. The components are the real ones — only `invoke`
 * is replaced, so the screenshots show the app and not a mock-up of it.
 */

import ar from "../../locales/ar.json";
import de from "../../locales/de.json";
import en from "../../locales/en.json";
import es from "../../locales/es.json";
import pl from "../../locales/pl.json";
import ru from "../../locales/ru.json";
import uk from "../../locales/uk.json";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import { activeReminders, completedReminders, popupReminders } from "../dataset";
import { runtime } from "../runtime";

const LOCALES: Record<string, Record<string, unknown>> = { ar, de, en, es, pl, ru, uk };

/** The display name, from the same source the app reads it from. */
const APP_NAME = tauriConfig.productName ?? tauriConfig.identifier;

export const invoked: { command: string; args?: Record<string, unknown> }[] = [];

/** What `list_reminders` returns for the scene being captured. */
function rows() {
  if (runtime.scene === "empty") return [];

  return [...activeReminders(runtime.lang), ...completedReminders(runtime.lang)];
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Match the IPC boundary: keep a serializable snapshot, not reactive proxies.
  invoked.push({ command: cmd, args: args ? JSON.parse(JSON.stringify(args)) : undefined });
  switch (cmd) {
    case "set_autostart":
      return Boolean(args?.enabled) as T;
    case "get_editor_reminder":
      if (new URLSearchParams(window.location.search).get("draft") === "new") return null as T;
      return (activeReminders(runtime.lang).find((reminder) => reminder.recurrence.type === "monthly") ??
        null) as T;
    case "list_reminders":
      return rows() as T;

    case "get_settings":
      // Light theme with the default accent — what every screenshot shows.
      return {
        language: runtime.lang,
        closeToTray: true,
        autostartEnabled: false,
        theme: "light",
        accent: "blue",
        popupCorner: "bottom-right",
      } as T;

    case "get_locale":
      return (LOCALES[String(args?.lang)] ?? en) as T;

    case "list_locales":
      // The real list is derived from the folder and sorted by code.
      return Object.keys(LOCALES)
        .sort()
        .map((code) => ({ code, name: (LOCALES[code].meta as { name: string }).name })) as T;

    case "get_popup_data":
      return (
        runtime.popup === "missed"
          ? { kind: "missed", reminders: popupReminders(runtime.lang, "missed") }
          : { kind: "single", reminder: popupReminders(runtime.lang, "single")[0] }
      ) as T;

    case "window_maximized":
      // The captured window is never maximized, so the caption shows maximize.
      return false as T;

    case "window_backdrop":
      // A browser has no system material behind it, so the app keeps its
      // solid layers in the screenshots.
      return false as T;

    case "app_name":
      // The name is not translatable: it comes from productName, never from a
      // locale file.
      return APP_NAME as T;

    default:
      // Nothing the screenshots take mutates the dataset, so every write is a no-op.
      return undefined as T;
  }
}
