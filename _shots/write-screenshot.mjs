import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

// Repeated Edge captures differed by up to 37 pixels and 3 levels per RGB channel.
const MAX_CHANGED_PIXELS = 64;
const MAX_CHANNEL_DELTA = 3;

function matchesScreenshot(existing, captured) {
  if (existing.equals(captured)) return true;

  const next = PNG.sync.read(captured);
  let previous;
  try {
    previous = PNG.sync.read(existing);
  } catch {
    // A valid capture can replace a corrupt gallery file.
    return false;
  }

  if (previous.width !== next.width || previous.height !== next.height) return false;

  let changedPixels = 0;
  for (let i = 0; i < next.data.length; i += 4) {
    const red = Math.abs(previous.data[i] - next.data[i]);
    const green = Math.abs(previous.data[i + 1] - next.data[i + 1]);
    const blue = Math.abs(previous.data[i + 2] - next.data[i + 2]);
    const delta = Math.max(red, green, blue);

    if (previous.data[i + 3] !== next.data[i + 3] || delta > MAX_CHANNEL_DELTA) return false;
    if (delta > 0 && ++changedPixels > MAX_CHANGED_PIXELS) return false;
  }

  return true;
}

/** Save a new or visibly changed shot and return whether the file was written. */
export function writeScreenshot(file, captured) {
  let existing;
  try {
    existing = readFileSync(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (existing && matchesScreenshot(existing, captured)) return false;

  writeFileSync(file, captured);
  return true;
}
