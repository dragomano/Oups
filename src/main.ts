import { getCurrentWindow } from "@tauri-apps/api/window";
import { mount } from "svelte";
import "./app.css";
import { disableContextMenu } from "./lib/context-menu";
import { roleForLabel, type WindowRole } from "./lib/window-role";

const target = document.getElementById("app");
if (!target) {
  throw new Error("#app mount point not found");
}

disableContextMenu();

// One page serves every window; the Tauri window label picks the component
// (see lib/window-role.ts). Without the Tauri internals — a plain browser tab
// during development — the label lookup fails and the main window renders.
let role: WindowRole = "main";
try {
  role = roleForLabel(getCurrentWindow().label);
} catch {
  // Keep the main window default.
}

// Dynamic imports keep one chunk per role, so a popup webview never parses
// the list, editor or settings code — the split the per-page entries used to
// provide.
const loaders = {
  main: () => import("./App.svelte"),
  popup: () => import("./Popup.svelte"),
  editor: () => import("./EditorWindow.svelte"),
  settings: () => import("./SettingsWindow.svelte"),
} as const;

void loaders[role]().then(({ default: Component }) => {
  mount(Component, { target });
});
