import { tick } from "svelte";
import { SNOOZE_UNITS, snoozeUnitLabel } from "../src/lib/snooze";
import { runtime } from "./runtime";
import { invoked } from "./stubs/core";
import { paint } from "./wait";

/** Exercise the real popup bindings and IPC payload before capturing its default state. */
export async function verifySnoozeControls() {
  const count = document.querySelector<HTMLInputElement>(".delay-row input");
  const unit = document.querySelector<HTMLSelectElement>(".delay-row select");
  const apply = document.querySelector<HTMLButtonElement>(".delay-row button");
  const form = document.querySelector<HTMLFormElement>(".delay-form");
  if (!count || !unit || !apply || !form) throw new Error("snooze controls missing");

  if (count.value !== "5" || count.min !== "1" || count.max !== "9999" || count.step !== "1") {
    throw new Error("snooze default or numeric bounds are wrong");
  }
  if (Array.from(unit.options, (option) => option.value).join() !== SNOOZE_UNITS.join()) {
    throw new Error("snooze units are wrong");
  }

  async function enter(value: string) {
    if (!count) return;
    count.value = value;
    count.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
  }

  for (const value of ["", "0", "-1", "1.5", "10000"]) {
    await enter(value);
    const before = invoked.length;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    if (!apply.disabled || invoked.length !== before || !document.querySelector("#snooze-error")) {
      throw new Error(`invalid snooze count was accepted: ${value}`);
    }
  }

  // The selected unit must survive label changes, including the Russian 11/21 cases.
  unit.value = "months";
  unit.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
  for (const value of [1, 2, 5, 11, 21, 22, 9999]) {
    await enter(String(value));
    const labels = Array.from(unit.options, (option) => option.textContent);
    const expected = SNOOZE_UNITS.map((key) => snoozeUnitLabel(key, value));
    if (apply.disabled || unit.value !== "months" || labels.join() !== expected.join()) {
      throw new Error(`snooze labels or selection are stale for ${value}`);
    }
  }

  for (const selected of SNOOZE_UNITS) {
    await enter(selected === "months" ? "9999" : "1");
    unit.value = selected;
    unit.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    form.requestSubmit();
    await paint();
    const call = invoked.at(-1);
    const command = runtime.popup === "missed" ? "snooze_missed_all" : "snooze_reminder";
    if (
      call?.command !== command ||
      call.args?.count !== Number(count.value) ||
      call.args?.unit !== selected
    ) {
      throw new Error("snooze IPC did not receive the selected count and unit");
    }
    if (runtime.popup !== "missed" && typeof call.args?.id !== "string") {
      throw new Error("single snooze lost the reminder ID");
    }
  }

  await enter("5");
  unit.value = "minutes";
  unit.dispatchEvent(new Event("change", { bubbles: true }));
  await paint();

  const frame = window.frameElement as HTMLIFrameElement | null;
  const originalWidth = frame?.style.width;
  if (frame) frame.style.width = "340px";
  await paint();
  for (const control of [count, unit, apply]) {
    const bounds = control.getBoundingClientRect();
    if (bounds.left < 0 || bounds.right > window.innerWidth + 1 || bounds.bottom > window.innerHeight + 1) {
      throw new Error("snooze controls do not fit the minimum popup width");
    }
  }
  if (frame) frame.style.width = originalWidth ?? "";
  await paint();
}
