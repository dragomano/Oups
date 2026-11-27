import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as geometry from "./geometry.mjs";

// scheduler.rs owns the popup geometry; the harness has to repeat it because a
// browser cannot read a Rust file. This test is what keeps the two in step.
const scheduler = readFileSync(new URL("../src-tauri/src/scheduler.rs", import.meta.url), "utf8");

function rustConstant(name) {
  const match = scheduler.match(new RegExp(`^const ${name}: f64 = (.+);$`, "m"));
  if (!match) throw new Error(`scheduler.rs no longer declares "${name}"`);
  return match[1]
    .split("/")
    .map(Number)
    .reduce((quotient, divisor) => quotient / divisor);
}

const { POPUP_H, POPUP_MARGIN, POPUP_MAX_SHARE, POPUP_W } = geometry;

// [scheduler.rs, geometry.mjs]: the harness names the inner height differently.
const SHARED = [
  ["POPUP_W", "POPUP_W"],
  ["POPUP_INNER_H", "POPUP_H"],
  ["POPUP_MARGIN", "POPUP_MARGIN"],
  ["POPUP_MAX_SHARE", "POPUP_MAX_SHARE"],
];
const HARNESS = { POPUP_W, POPUP_H, POPUP_MARGIN, POPUP_MAX_SHARE };

// The outer size with the native title bar: the canvas has none to draw.
const RUST_ONLY = ["POPUP_H"];

describe("screenshot harness geometry", () => {
  it.each(SHARED)("geometry.mjs %s equals scheduler.rs %s", (rust, js) => {
    expect(HARNESS[js], js).toBe(rustConstant(rust));
  });

  it("compares every popup constant the harness declares", () => {
    const declared = Object.entries(geometry)
      .map(([name]) => name)
      .filter((name) => name.startsWith("POPUP_"))
      .sort();
    expect(declared).toEqual(SHARED.map(([, js]) => js).sort());
  });

  it("compares every popup constant the scheduler declares", () => {
    const declared = [...scheduler.matchAll(/^const (POPUP_[A-Z_]+): f64/gm)].map((match) => match[1]);
    expect(declared.sort()).toEqual([...SHARED.map(([rust]) => rust), ...RUST_ONLY].sort());
  });
});
