<script lang="ts">
  import type { Component } from "svelte";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowDownLeft from "@lucide/svelte/icons/arrow-down-left";
  import ArrowDownRight from "@lucide/svelte/icons/arrow-down-right";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowUpLeft from "@lucide/svelte/icons/arrow-up-left";
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
  import Circle from "@lucide/svelte/icons/circle";
  import { t } from "../lib/i18n.svelte";
  import { radioGroup } from "../lib/radio-group";

  let { value, onchange }: { value: string; onchange: (value: string) => void } = $props();

  const CORNERS = [
    "top-left", "center-top", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "center-bottom", "bottom-right",
  ] as const;
  const CORNER_ICONS: Record<(typeof CORNERS)[number], Component> = {
    "top-left": ArrowUpLeft, "center-top": ArrowUp, "top-right": ArrowUpRight,
    "center-left": ArrowLeft, center: Circle, "center-right": ArrowRight,
    "bottom-left": ArrowDownLeft, "center-bottom": ArrowDown, "bottom-right": ArrowDownRight,
  };

  function cornerLabel(corner: string): string {
    return t(`corner.${corner.replace("-", "_")}`);
  }
</script>

<div class="settings-field">
  <span>{t("settings.popup_corner")}</span>
  <div class="settings-monitor">
    <div class="settings-screen">
      <div class="settings-arrows" role="radiogroup" aria-label={t("settings.popup_corner")} dir="ltr" use:radioGroup={3}>
        {#each CORNERS as corner (corner)}
          {@const CornerIcon = CORNER_ICONS[corner]}
          <button type="button" aria-label={cornerLabel(corner)} role="radio" aria-checked={value === corner}
            tabindex={value === corner ? 0 : -1} onclick={() => onchange(corner)}>
            <CornerIcon size={corner === "center" ? 10 : 20} aria-hidden="true" />
          </button>
        {/each}
      </div>
    </div>
    <div class="settings-monitor-stand" aria-hidden="true"><span></span></div>
  </div>
  <span class="settings-position" aria-hidden="true">{cornerLabel(value)}</span>
</div>

<style>
  .settings-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .settings-field > span { color: var(--muted); font-size: 13px; }

  .settings-screen {
    --corner-size: 44px;
    position: relative;
    z-index: 1;
    width: 100%;
    height: 184px;
    background: var(--monitor-screen);
    border: 3px solid var(--border);
    border-radius: 11px;
    box-shadow: inset 0 1px 3px var(--shadow-color),
      0 -1px 0 var(--edge-highlight),
      0 10px 16px -6px var(--shadow-color);
  }

  .settings-monitor-stand {
    --stand-fill: color-mix(in srgb, var(--border) 90%, var(--muted));
    --stand-border: color-mix(in srgb, var(--border) 75%, var(--muted));
    position: relative;
    height: 36px;
  }

  .settings-monitor-stand > span,
  .settings-monitor-stand::before,
  .settings-monitor-stand::after {
    position: absolute;
    left: 50%;
    background: var(--stand-fill);
    border: 1px solid var(--stand-border);
  }

  .settings-monitor-stand > span {
    top: -1px;
    width: 24px;
    height: 19px;
    border-block: none;
    transform: translateX(-50%);
    box-shadow: inset 0 9px 9px -5px var(--shadow-color);
  }

  .settings-monitor-stand::before,
  .settings-monitor-stand::after {
    content: "";
    top: 12px;
    width: 70px;
    height: 7px;
    border-radius: 3px;
    transform-origin: 0 50%;
    box-shadow: 0 4px 6px -3px var(--shadow-color);
  }

  .settings-monitor-stand::before { transform: rotate(165deg); }
  .settings-monitor-stand::after { transform: rotate(15deg); }

  .settings-arrows {
    position: absolute;
    inset: 8px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 5px;
    place-items: center;
  }

  .settings-arrows button {
    display: grid;
    place-items: center;
    inline-size: var(--corner-size);
    block-size: var(--corner-size);
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--surface-hover);
    color: var(--muted);
    box-shadow: inset 0 1px 0 var(--edge-highlight),
      0 4px 7px -2px var(--shadow-color),
      0 1px 2px var(--overlay-soft);
  }

  .settings-arrows button[aria-checked="true"] {
    background: var(--accent);
    color: var(--accent-text);
  }

  .settings-field > .settings-position {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    margin-top: 6px;
  }

  .settings-arrows button:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
</style>
