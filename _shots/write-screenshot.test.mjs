import { mkdtempSync, readFileSync, rmdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeScreenshot } from "./write-screenshot.mjs";

function screenshot({ width = 16, height = 16, pixels = 0, delta = 0, channel = 0, filterType = 0 } = {}) {
  const data = Buffer.alloc(width * height * 4, Buffer.from([128, 128, 128, 255]));
  for (let i = 0; i < pixels; i++) data[i * 4 + channel] += delta;
  return PNG.sync.write({ width, height, data }, { filterType });
}

describe("writeScreenshot", () => {
  const baseline = screenshot();
  let directory;
  let file;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "oups-shot-test-"));
    file = join(directory, "shot.png");
  });

  afterEach(() => {
    rmSync(file, { force: true });
    rmdirSync(directory);
  });

  it("writes a new screenshot", () => {
    expect(writeScreenshot(file, baseline)).toBe(true);
    expect(readFileSync(file)).toEqual(baseline);
  });

  it("replaces a corrupt screenshot", () => {
    writeFileSync(file, "invalid PNG");
    expect(writeScreenshot(file, baseline)).toBe(true);
    expect(readFileSync(file)).toEqual(baseline);
  });

  it("preserves the file and its timestamp for identical pixels and minor rasterization noise", () => {
    writeFileSync(file, baseline);
    utimesSync(file, 1, 1);

    const reencoded = screenshot({ filterType: 4 });
    expect(reencoded).not.toEqual(baseline);
    expect(writeScreenshot(file, baseline)).toBe(false);
    expect(writeScreenshot(file, reencoded)).toBe(false);
    expect(writeScreenshot(file, screenshot({ pixels: 64, delta: -3, channel: 2 }))).toBe(false);
    expect(readFileSync(file)).toEqual(baseline);
    expect(statSync(file).mtimeMs).toBe(1000);
  });

  it.each([
    ["one pixel changes by more than three RGB levels", { pixels: 1, delta: 4, channel: 1 }],
    ["more than 64 pixels change slightly", { pixels: 65, delta: 1 }],
    ["opacity changes", { pixels: 1, delta: -1, channel: 3 }],
    ["the dimensions change", { width: 8, height: 32 }],
  ])("writes a screenshot when %s", (_label, changes) => {
    writeFileSync(file, baseline);
    const updated = screenshot(changes);
    expect(writeScreenshot(file, updated)).toBe(true);
    expect(readFileSync(file)).toEqual(updated);
  });
});
