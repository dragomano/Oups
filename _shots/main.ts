// Harness entry point for the MAIN window: mounts the real App with the Tauri
// bridge stubbed, then drives it into the scene the capture asked for.

import "./freeze-clock";
import "./no-motion";
import { mount } from "svelte";
import "../src/app.css";
import App from "../src/App.svelte";
import { readParams, runtime } from "./runtime";
import { paint, ready, waitFor } from "./wait";

readParams();

mount(App, { target: document.getElementById("app") as HTMLElement });

const tabs = () => [...document.querySelectorAll<HTMLButtonElement>(".seg .seg-btn")];

async function show(scene: typeof runtime.scene) {
  if (scene === "list" || scene === "empty") return;

  if (scene === "completed" || scene === "matrix") {
    await waitFor(".seg-btn", "the toolbar");
    tabs()[scene === "matrix" ? 2 : 1]?.click();
    await waitFor(scene === "matrix" ? ".quad" : ".row", `the ${scene} view`);
    return;
  }

  if (scene === "settings") {
    await waitFor(".icon-settings", "the settings button");
    document.querySelector<HTMLButtonElement>(".icon-settings")?.click();
  }
}

async function run() {
  // The store loads asynchronously (settings -> locale -> reminders), so wait
  // for content rather than for a fixed delay.
  await waitFor(".row, .quad, .placeholder", "the reminder list");

  await show(runtime.scene);

  await paint();
  ready();
}

run().catch((e) => {
  document.documentElement.dataset.shotsError = String(e);
  console.error(e);
});
