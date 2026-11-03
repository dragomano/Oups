import { listen } from "@tauri-apps/api/event";
import { api, type Reminder } from "./api";

export const store = $state<{ reminders: Reminder[]; loaded: boolean }>({
  reminders: [],
  loaded: false,
});

export async function refresh() {
  try {
    store.reminders = await api.listReminders();
  } catch (e) {
    console.error("failed to list reminders", e);
  } finally {
    store.loaded = true;
  }
}

export async function initState() {
  await listen("reminders-changed", refresh);
  await refresh();
}
