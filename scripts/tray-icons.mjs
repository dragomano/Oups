// Renders Lucide icons (lucide-static) to PNGs for the native tray menu.
// The tray menu is a Rust menu, so icons must be rasterized and embedded
// (include_bytes! in src-tauri/src/tray.rs). Run: pnpm tray-icons

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "icons", "menu");
const lucide = join(root, "node_modules", "lucide-static", "icons");

// Neutral gray reads on both light and dark native menus.
const COLOR = "#8a8a8a";
const SIZE = 32; // 2x of the usual 16px menu icon, keeps crisp on HiDPI

// Lucide names for each tray menu item (about uses the app icon, no glyph).
const icons = {
  "app-window": "app-window",
  "bell-plus": "bell-plus",
  settings: "settings",
  power: "power",
};

mkdirSync(outDir, { recursive: true });
for (const [name, file] of Object.entries(icons)) {
  let svg = readFileSync(join(lucide, `${file}.svg`), "utf8");
  svg = svg.replace(/width="24" height="24"/, `width="${SIZE}" height="${SIZE}"`);
  svg = svg.replace(/stroke="currentColor"/, `stroke="${COLOR}"`);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng();
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log(`rendered ${name}.png`);
}
