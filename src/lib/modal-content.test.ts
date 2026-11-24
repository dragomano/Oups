import { afterEach, describe, expect, it, vi } from "vitest";
import { observeModalHeight } from "./modal-content";

afterEach(() => vi.unstubAllGlobals());

describe("modal content sizing", () => {
  it("fits before a hidden webview delivers observer notifications or animation frames", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    const requestFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const form = { getBoundingClientRect: () => ({ height: 280.5 }) } as HTMLElement;
    const footer = { getBoundingClientRect: () => ({ height: 49 }) } as HTMLElement;
    const fit = vi.fn().mockResolvedValue(undefined);
    const observer = observeModalHeight([null, form, footer], fit);

    expect(fit).toHaveBeenCalledExactlyOnceWith(330);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(observe.mock.calls).toEqual([[form], [footer]]);
    observer.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
