import "./freeze-clock";
import "./no-motion";
import { mount } from "svelte";
import "../src/app.css";
import { loadLocale } from "../src/lib/i18n.svelte";
import EditorScene from "./EditorScene.svelte";
import { readParams, runtime } from "./runtime";
import { paint, ready, waitFor } from "./wait";

readParams();
await loadLocale(runtime.lang);
mount(EditorScene, { target: document.getElementById("app") as HTMLElement });
await waitFor(".reminder-editor", "the editor content");
await paint();

const frame = window.frameElement as HTMLIFrameElement | null;
if (frame) {
  const form = document.querySelector<HTMLElement>(".editor-form");
  const footer = document.querySelector<HTMLElement>(".footer");
  const header = document.querySelector<HTMLElement>(".editor-head");
  if (form && footer && header) {
    const height = Math.ceil(header.offsetHeight + form.offsetHeight + footer.offsetHeight);
    frame.style.height = `${Math.min(height, window.parent.innerHeight - 48)}px`;
    frame.style.top = `${Math.max(24, (window.parent.innerHeight - height) / 2)}px`;
  }
  await paint();
  document.querySelector<HTMLButtonElement>(".picker-btn")?.click();
  await waitFor(".picker-menu", "the priority options");
}
await paint();
ready();
