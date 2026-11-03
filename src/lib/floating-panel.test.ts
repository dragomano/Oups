import { describe, expect, it } from "vitest";
import { floatingPanel } from "./floating-panel";

describe("floatingPanel", () => {
  it("opens below a control when there is room", () => {
    expect(floatingPanel({ left: 30, top: 40, bottom: 80, width: 280 }, 240, 820, 600)).toEqual({
      left: 30,
      top: 84,
      width: 280,
      maxHeight: 584,
    });
  });

  it("opens above a control near the bottom edge", () => {
    expect(floatingPanel({ left: 30, top: 450, bottom: 490, width: 280 }, 240, 390, 568).top).toBe(206);
  });

  it("clamps both axes and the panel size on a small screen", () => {
    const panel = floatingPanel({ left: -20, top: 180, bottom: 220, width: 400 }, 300, 320, 240);
    expect(panel).toEqual({ left: 8, top: 8, width: 304, maxHeight: 224 });
  });

  it("keeps right-edge controls and resized panels inside the viewport", () => {
    const panel = floatingPanel({ left: 300, top: 10, bottom: 50, width: 280 }, 200, 390, 320);
    expect(panel.left + panel.width).toBe(382);
    expect(panel.top).toBeGreaterThanOrEqual(8);
  });
});
