import { describe, expect, it, vi } from "vitest";
import { nextRadioIndex, radioGroup } from "./radio-group";

describe("radio navigation", () => {
  it.each([
    ["ArrowLeft", 0, 8],
    ["ArrowUp", 0, 8],
    ["ArrowRight", 8, 0],
    ["ArrowDown", 8, 0],
    ["ArrowRight", 3, 4],
    ["ArrowUp", 3, 2],
    ["Home", 4, 0],
    ["End", 4, 8],
  ])("moves through swatches with %s from %i to %i", (key, from, to) => {
    expect(nextRadioIndex(key, from, 9)).toBe(to);
  });

  it.each([
    ["ArrowLeft", 0, 2],
    ["ArrowRight", 2, 0],
    ["ArrowLeft", 3, 5],
    ["ArrowRight", 8, 6],
    ["ArrowUp", 0, 6],
    ["ArrowDown", 8, 2],
    ["ArrowUp", 4, 1],
    ["ArrowDown", 4, 7],
    ["ArrowLeft", 4, 3],
    ["ArrowRight", 4, 5],
  ])("moves spatially in the position grid with %s from %i to %i", (key, from, to) => {
    expect(nextRadioIndex(key, from, 9, 3)).toBe(to);
  });

  it("leaves Tab, Space, Enter and Escape to their native handlers", () => {
    for (const key of ["Tab", " ", "Enter", "Escape"]) {
      expect(nextRadioIndex(key, 4, 9)).toBeNull();
    }
  });

  it("ignores empty groups and focus outside the group", () => {
    expect(nextRadioIndex("ArrowRight", 0, 0)).toBeNull();
    expect(nextRadioIndex("ArrowRight", -1, 9)).toBeNull();
    expect(nextRadioIndex("ArrowRight", 9, 9)).toBeNull();
  });
});

describe("radio group keyboard action", () => {
  function setup(direction = "ltr") {
    const radios = Array.from({ length: 9 }, () => ({ focus: vi.fn(), click: vi.fn() }));
    const group = Object.assign(new EventTarget(), {
      ownerDocument: {
        activeElement: radios[4],
        defaultView: { getComputedStyle: () => ({ direction }) },
      },
      querySelectorAll: () => radios,
    });
    const action = radioGroup(group as unknown as HTMLElement);

    function press(key: string, modifiers = {}) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), { key }, modifiers);
      group.dispatchEvent(event);
      return event;
    }

    return { radios, action, press };
  }

  it("focuses and activates the next option, preventing page scroll", () => {
    const { radios, action, press } = setup();
    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(radios[5].focus).toHaveBeenCalledOnce();
    expect(radios[5].click).toHaveBeenCalledOnce();
    action.destroy();
  });

  it("uses the grid width and follows visual order in RTL groups", () => {
    const { radios, action, press } = setup("rtl");
    press("ArrowRight");
    expect(radios[3].click).toHaveBeenCalledOnce();
    action.update(3);
    press("ArrowDown");
    expect(radios[7].click).toHaveBeenCalledOnce();
    action.destroy();
  });

  it("does not hijack modified arrows or unrelated keys", () => {
    const { radios, action, press } = setup();
    expect(press("Tab").defaultPrevented).toBe(false);
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      expect(press("ArrowLeft", { [modifier]: true }).defaultPrevented).toBe(false);
    }
    for (const radio of radios) expect(radio.click).not.toHaveBeenCalled();
    action.destroy();
  });

  it("removes keyboard handling when the group is destroyed", () => {
    const { radios, action, press } = setup();
    action.destroy();
    expect(press("ArrowRight").defaultPrevented).toBe(false);
    for (const radio of radios) expect(radio.click).not.toHaveBeenCalled();
  });
});
