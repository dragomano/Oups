import { tick } from "svelte";
import { SNOOZE_UNITS, snoozeUnitLabel } from "../src/lib/snooze";
import { runtime } from "./runtime";
import { invoked } from "./stubs/core";
import { paint } from "./wait";

/** Exercise the real popup bindings and IPC payload before capturing its default state. */
export async function verifySnoozeControls() {
  const row = document.querySelector<HTMLElement>(".delay-row");
  const count = row?.querySelector<HTMLInputElement>(".number-input");
  const trigger = row?.querySelector<HTMLButtonElement>(".select-trigger");
  const apply = row?.querySelector<HTMLButtonElement>('button[type="submit"]');
  const form = document.querySelector<HTMLFormElement>(".delay-form");
  if (!row || !count || !trigger || !apply || !form) throw new Error("snooze controls missing");

  if (count.value !== "5") {
    throw new Error("snooze default is wrong");
  }

  async function openUnits() {
    if (trigger.getAttribute("aria-expanded") !== "true") {
      trigger.click();
      await tick();
    }

    return Array.from(row.querySelectorAll<HTMLElement>(".select-menu [role='option']"));
  }

  async function pick(index: number) {
    (await openUnits())[index]?.click();
    await tick();
  }

  async function enter(value: string) {
    count.value = value;
    count.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
  }

  for (const value of ["", "abc", "0", "-1", "1.5", "10000"]) {
    await enter(value);
    const before = invoked.length;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    if (!apply.disabled || invoked.length !== before || !row.parentElement?.querySelector(".delay-error")) {
      throw new Error(`invalid snooze count was accepted: ${value}`);
    }
  }

  // The selected unit must survive label changes, including the Russian 11/21 cases.
  const months = SNOOZE_UNITS.indexOf("months");
  await pick(months);
  for (const value of [1, 2, 5, 11, 21, 22, 9999]) {
    await enter(String(value));
    const options = await openUnits();
    const labels = options.map((option) => option.querySelector("span")?.textContent);
    const expected = SNOOZE_UNITS.map((key) => snoozeUnitLabel(key, value));
    const selected = options.findIndex((option) => option.getAttribute("aria-selected") === "true");
    if (apply.disabled || selected !== months || labels.join() !== expected.join()) {
      throw new Error(`snooze labels or selection are stale for ${value}`);
    }
    trigger.click();
    await tick();
  }

  for (const [index, selected] of SNOOZE_UNITS.entries()) {
    await enter(selected === "months" ? "9999" : "1");
    await pick(index);
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
  await pick(SNOOZE_UNITS.indexOf("minutes"));
  await paint();

  const frame = window.frameElement as HTMLIFrameElement | null;
  const originalWidth = frame?.style.width;
  if (frame) frame.style.width = "340px";
  await paint();
  for (const control of [count, trigger, apply]) {
    const bounds = control.getBoundingClientRect();
    if (bounds.left < 0 || bounds.right > window.innerWidth + 1 || bounds.bottom > window.innerHeight + 1) {
      throw new Error("snooze controls do not fit the minimum popup width");
    }
  }
  if (frame) frame.style.width = originalWidth ?? "";
  await paint();
}
