import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chooseToolbarLayout, SEARCH_MIN_WIDTH, type ToolbarLayoutMetrics } from "./toolbar-layout";

/**
 * Metrics of the Russian toolbar as the browser measures it (Segoe UI 15px),
 * read from the real component in the screenshot harness. Russian is the
 * widest shipped language, so it decides how much room the bar needs.
 * The exact numbers do not matter; the shape does — labels are what makes the
 * bar overflow, so they dominate.
 */
const RU: ToolbarLayoutMetrics = {
  available: 0,
  gap: 10,
  search: SEARCH_MIN_WIDTH,
  newWithLabel: 191,
  // Icon-only buttons are a fixed 30px square (button.icon).
  newIcon: 30,
  ioWithLabels: 216,
  ioIcons: 70,
  settings: 30,
};

/**
 * Metrics of the title strip: the brand, the view tabs and the caption
 * buttons. They are never dropped, so the window's minimum width has to
 * cover them too.
 */
const STRIP = {
  gap: 10,
  brand: 71,
  tabs: 303,
  // Divider + three 28px caption buttons + the gaps inside the cluster.
  caption: 95,
};

const row = (parts: number[], gap: number) => parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);

/** Width of the first row in the given layout, as the toolbar will render it. */
function firstRowWidth(m: ToolbarLayoutMetrics, l: ReturnType<typeof chooseToolbarLayout>) {
  const newBtn = l.newLabel ? m.newWithLabel : m.newIcon;
  const parts = l.searchOwnRow
    ? [newBtn, l.ioLabels ? m.ioWithLabels : m.ioIcons, m.settings]
    : [newBtn, m.search, l.ioLabels ? m.ioWithLabels : m.ioIcons, m.settings];

  return row(parts, m.gap);
}

/** The densest state the bar can reach: icon-only buttons, search below. */
const densestRow = (m: ToolbarLayoutMetrics) => firstRowWidth(m, chooseToolbarLayout({ ...m, available: 0 }));

describe("chooseToolbarLayout", () => {
  it("keeps everything, search included, on one row while it fits", () => {
    const m = { ...RU, available: 1100 };
    expect(chooseToolbarLayout(m)).toEqual({ ioLabels: true, newLabel: true, searchOwnRow: false });
  });

  it("moves the search down at the exact boundary, never earlier", () => {
    const oneRow = row([RU.newWithLabel, RU.search, RU.ioWithLabels, RU.settings], RU.gap);
    expect(chooseToolbarLayout({ ...RU, available: oneRow }).searchOwnRow).toBe(false);
    expect(chooseToolbarLayout({ ...RU, available: oneRow - 1 }).searchOwnRow).toBe(true);
  });

  it("keeps the Import/Export labels while the button row fits", () => {
    const withBoth = row([RU.newWithLabel, RU.ioWithLabels, RU.settings], RU.gap);
    const layout = chooseToolbarLayout({ ...RU, available: withBoth });
    expect(layout).toEqual({ ioLabels: true, newLabel: true, searchOwnRow: true });
  });

  it("drops the New reminder label before the Import/Export ones", () => {
    const withBoth = row([RU.newWithLabel, RU.ioWithLabels, RU.settings], RU.gap);
    const layout = chooseToolbarLayout({ ...RU, available: withBoth - 1 });
    expect(layout).toEqual({ ioLabels: true, newLabel: false, searchOwnRow: true });
  });

  it("falls back to icon-only Import/Export only when nothing else fits", () => {
    const withIoLabels = row([RU.newIcon, RU.ioWithLabels, RU.settings], RU.gap);
    expect(chooseToolbarLayout({ ...RU, available: withIoLabels }).ioLabels).toBe(true);
    expect(chooseToolbarLayout({ ...RU, available: withIoLabels - 1 })).toEqual({
      ioLabels: false,
      newLabel: false,
      searchOwnRow: true,
    });
  });

  it("moves the search down rather than squeezing it below its minimum width", () => {
    // Regression: the search used to be allowed to shrink to a too-narrow
    // field at intermediate widths. The single-row layout must use the search
    // at its full minimum, and as soon as even that does not fit the search
    // goes to its own row.
    expect(SEARCH_MIN_WIDTH).toBeGreaterThanOrEqual(170);
    const oneRow = row([RU.newWithLabel, SEARCH_MIN_WIDTH, RU.ioWithLabels, RU.settings], RU.gap);
    expect(chooseToolbarLayout({ ...RU, available: oneRow })).toEqual({
      ioLabels: true,
      newLabel: true,
      searchOwnRow: false,
    });
    expect(chooseToolbarLayout({ ...RU, available: oneRow - 1 }).searchOwnRow).toBe(true);
  });

  it("never lets a button wrap onto a third row", () => {
    // Regression: hardcoded 1134/680/600px thresholds used to leave the
    // Import/Export buttons and the gear wrapping onto a row of their own at
    // ~755-768px. Whatever the width, the chosen first row has to fit. The
    // sweep starts where a fit is possible at all: the densest row.
    const from = densestRow(RU);
    for (let available = from; available <= from + 1000; available++) {
      const m = { ...RU, available };
      const layout = chooseToolbarLayout(m);
      expect(firstRowWidth(m, layout), `available=${available}`).toBeLessThanOrEqual(available);
    }
  });

  it("fits the densest row into the narrowest window the app allows", () => {
    // The subtracted pixels are the app frame (App.svelte: 6px gutter + 1px
    // card border per side) and the toolbar's own padding (14px per side),
    // plus 1px of slack.
    const config = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "src-tauri", "tauri.conf.json"), "utf8"),
    );
    const chrome = 6 * 2 + 1 * 2 + 14 * 2 + 1;
    const available = config.app.windows[0].minWidth - chrome;
    const layout = chooseToolbarLayout({ ...RU, available });
    expect(firstRowWidth({ ...RU, available }, layout)).toBeLessThanOrEqual(available);
  });

  it("fits the title strip into the narrowest window the app allows", () => {
    // The tabs and the caption buttons live in the title strip and are never
    // dropped, so minWidth in tauri.conf.json has to cover them as well. The
    // subtracted pixels are the app frame (6px gutter + 1px card border per
    // side) and the strip's own padding (13px + 6px).
    const config = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "src-tauri", "tauri.conf.json"), "utf8"),
    );
    const chrome = 6 * 2 + 1 * 2 + 13 + 6;
    const available = config.app.windows[0].minWidth - chrome;
    const strip = row([STRIP.brand, STRIP.tabs, STRIP.caption], STRIP.gap);
    expect(strip).toBeLessThanOrEqual(available);
  });

  it("prefers labels over icon-only buttons at the same width", () => {
    // With room to spare the labels must be shown: the densest state is a
    // fallback, not a default.
    const m = { ...RU, available: 1400 };
    expect(chooseToolbarLayout(m).ioLabels).toBe(true);
  });

  it("measures the labels, not the window: wider labels give icons earlier", () => {
    // At this width the longer labels only fit without the New reminder label,
    // and only if Import/Export keep their own labels too.
    const narrow = { ...RU, available: 300, ioWithLabels: 260, newWithLabel: 220 };
    const wide = { ...RU, available: 300, ioWithLabels: 200, newWithLabel: 191 };
    expect(chooseToolbarLayout(wide).ioLabels).toBe(true);
    expect(chooseToolbarLayout(narrow).ioLabels).toBe(false);
  });
});
