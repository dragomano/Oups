// Harness entry point for the TRAY MENU shot. The native menu itself cannot
// be captured by a browser harness, so this page rebuilds it in DOM — from the
// real labels (locales/*.json via the app's own t()), the real icon PNGs that
// are embedded into the binary, and the real name/version. See tray.html.

import "./freeze-clock";
import "./no-motion";
import { loadLocale, t } from "../src/lib/i18n.svelte";
import cargo from "../src-tauri/Cargo.toml?raw";
import aboutIcon from "../src-tauri/icons/32x32.png";
import openIcon from "../src-tauri/icons/menu/app-window.png";
import newIcon from "../src-tauri/icons/menu/bell-plus.png";
import quitIcon from "../src-tauri/icons/menu/power.png";
import settingsIcon from "../src-tauri/icons/menu/settings.png";
import conf from "../src-tauri/tauri.conf.json";
import { readParams, runtime } from "./runtime";
import { paint, ready } from "./wait";

readParams();

/** The version lives ONLY in Cargo.toml — the menu reads it from there too. */
function appVersion(): string {
  return cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "";
}

type Item = { label: string; icon: string } | "separator";

function menu(): Item[] {
  const about = `${conf.productName} ${appVersion()}`;
  return [
    { label: about, icon: aboutIcon },
    "separator",
    { label: t("tray.open"), icon: openIcon },
    { label: t("tray.new"), icon: newIcon },
    { label: t("toolbar.settings"), icon: settingsIcon },
    "separator",
    { label: t("tray.quit"), icon: quitIcon },
  ];
}

function build() {
  const root = document.getElementById("menu") as HTMLElement;
  root.replaceChildren();
  const list = document.createElement("div");
  list.className = "menu";

  for (const item of menu()) {
    if (item === "separator") {
      const sep = document.createElement("div");
      sep.className = "sep";
      list.append(sep);
      continue;
    }

    const row = document.createElement("div");
    row.className = "item";

    const icon = document.createElement("img");
    icon.src = item.icon;
    icon.alt = "";
    icon.width = 16;
    icon.height = 16;

    const label = document.createElement("span");
    label.textContent = item.label;

    row.append(icon, label);
    // One hovered row shows the menu is alive; "new" is the busiest action.
    if (item.label === t("tray.new")) row.classList.add("hover");
    list.append(row);
  }

  root.append(list);
}

async function run() {
  await loadLocale(runtime.lang);
  build();
  await paint();
  ready();
}

run().catch((e) => {
  document.documentElement.dataset.shotsError = String(e);
  console.error(e);
});
