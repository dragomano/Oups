import { describe, expect, it } from "vitest";
import { roleForLabel } from "./window-role";

describe("roleForLabel", () => {
  it("maps the fixed window labels", () => {
    expect(roleForLabel("main")).toBe("main");
    expect(roleForLabel("editor")).toBe("editor");
    expect(roleForLabel("settings")).toBe("settings");
  });

  it("maps both popup kinds: per-reminder and the missed list", () => {
    expect(roleForLabel("reminder-abc123")).toBe("popup");
    expect(roleForLabel("missed")).toBe("popup");
  });

  it("needs the dash after the reminder prefix", () => {
    expect(roleForLabel("reminder")).toBe("main");
  });

  it("falls back to the main window for unknown labels", () => {
    expect(roleForLabel("tray")).toBe("main");
    expect(roleForLabel("")).toBe("main");
  });
});
