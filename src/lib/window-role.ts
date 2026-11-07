/**
 * One page (`index.html`) serves every window, so the component is picked by
 * the Tauri window label instead of the page URL. The labels come from the
 * Rust side: the main window (`main`), the modal editor and settings, and the
 * popups (`reminder-<id>` per reminder, `missed` for the startup catch-up).
 */
export type WindowRole = "main" | "popup" | "editor" | "settings";

const LABEL_ROLES: Record<string, Exclude<WindowRole, "popup">> = {
  main: "main",
  editor: "editor",
  settings: "settings",
};

export function roleForLabel(label: string): WindowRole {
  if (label === "missed" || label.startsWith("reminder-")) return "popup";
  // Unknown labels cannot happen (every window is created by the app with one
  // of the labels above); fall back to the main window so nothing blanks out.
  return LABEL_ROLES[label] ?? "main";
}
