import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import Select from "../components/Select.svelte";
import Popup from "../Popup.svelte";

describe("screen reader markup", () => {
  it("exposes a combobox name separately from its current value", () => {
    const { body } = render(Select, {
      props: {
        ariaLabel: "Time unit",
        value: "minutes",
        options: [{ value: "minutes", label: "minutes" }],
      },
    });

    expect(body).toContain('aria-label="Time unit"');
    expect(body).not.toContain("Time unit minutes");
    expect(body).toMatch(/class="select-value[^"]*"[^>]*>minutes<\/span>/);
    expect(body).not.toMatch(/<span[^>]*aria-hidden="true"[^>]*>minutes<\/span>/);
  });

  it("does not expose a translation key while a notification is loading", () => {
    const { head } = render(Popup);
    expect(head).not.toContain("popup.missed_title");
  });
});
