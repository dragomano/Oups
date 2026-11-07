// Harness entry point for the POPUP window: mounts the real Popup component.
// The card chrome (rounded corners, no window background) is the only thing
// this entry adds — see popup.html.

import "./freeze-clock";
import "./no-motion";
import { mount } from "svelte";
import "../src/app.css";
import Popup from "../src/Popup.svelte";
import { readParams } from "./runtime";
import { paint, ready, waitFor } from "./wait";

readParams();

mount(Popup, { target: document.getElementById("app") as HTMLElement });

async function run() {
  await waitFor(".wrap:not(.muted)", "the popup");
  await paint();
  ready();
}

run().catch((e) => {
  document.documentElement.dataset.shotsError = String(e);
  console.error(e);
});
