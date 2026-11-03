import "./no-motion";
import { mount } from "svelte";
import "../src/app.css";
import SettingsWindow from "../src/settings/SettingsWindow.svelte";
import { readParams } from "./runtime";
import { paint, ready, waitFor } from "./wait";

readParams();
mount(SettingsWindow, { target: document.getElementById("app") as HTMLElement });
await waitFor(".settings-swatches", "the settings content");
await paint();
const frame = window.frameElement as HTMLIFrameElement | null;
if (frame) {
  const header = document.querySelector<HTMLElement>(".settings-head");
  const grid = document.querySelector<HTMLElement>(".settings-grid");
  const footer = document.querySelector<HTMLElement>(".settings-footer");
  if (header && grid && footer) {
    const height = header.offsetHeight + grid.offsetHeight + footer.offsetHeight;
    frame.style.height = `${Math.min(height, window.parent.innerHeight - 48)}px`;
    frame.style.top = `${Math.max(24, (window.parent.innerHeight - height) / 2)}px`;
  }
  await paint();
}
ready();
