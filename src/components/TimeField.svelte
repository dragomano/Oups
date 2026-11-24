<script lang="ts">
  import Clock from "@lucide/svelte/icons/clock";
  import { tick, untrack } from "svelte";
  import { t } from "../lib/i18n.svelte";
  import { floatingPanel } from "../lib/floating-panel";
  import { watchFloatingPopup } from "../lib/floating-popup";

  let {
    value = $bindable(""),
    ariaLabel = "",
  }: { value?: string; ariaLabel?: string } = $props();

  const id = $props.id();
  const WIDTH = 260;

  const pad = (n: number) => String(n).padStart(2, "0");
  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

  function parse(text: string): { hours: number; minutes: number } {
    const [hours, minutes] = text.split(":").map((part) => Number.parseInt(part, 10));

    return {
      hours: clamp(Number.isFinite(hours) ? hours : 0, 23),
      minutes: clamp(Number.isFinite(minutes) ? minutes : 0, 59),
    };
  }

  const initial = parse(value);

  let hours = $state(initial.hours);
  let minutes = $state(initial.minutes);
  let open = $state(false);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let popover = $state<HTMLElement>();
  let pos = $state({ top: 0, left: 0, width: WIDTH, maxHeight: 400 });

  $effect(() => {
    const next = parse(value);

    untrack(() => {
      hours = next.hours;
      minutes = next.minutes;
    });
  });

  const label = $derived(`${pad(hours)}:${pad(minutes)}`);
  const hoursFill = $derived(`${(hours / 23) * 100}%`);
  const minutesFill = $derived(`${(minutes / 59) * 100}%`);

  function close() {
    open = false;
    trigger?.focus({ preventScroll: true });
  }

  async function show() {
    open = true;
    await tick();
    place();
    await tick();
    popover?.querySelector("input")?.focus();
  }

  function setHours(next: number) {
    hours = clamp(next, 23);
    value = `${pad(hours)}:${pad(minutes)}`;
  }

  function setMinutes(next: number) {
    minutes = clamp(next, 59);
    value = `${pad(hours)}:${pad(minutes)}`;
  }

  /** The popover is position: fixed, so the editor's scroll container cannot clip it. */
  function place() {
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const fitted = floatingPanel(
      { left: rect.left, top: rect.top, bottom: rect.bottom, width: Math.min(WIDTH, window.innerWidth - 16) },
      popover?.scrollHeight ?? 200,
      window.innerWidth,
      window.innerHeight,
    );

    pos = { ...fitted, maxHeight: Math.min(400, fitted.maxHeight) };
  }

  // Enter commits the time and returns to the trigger without submitting the form.
  function acceptTime(event: KeyboardEvent) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    close();
  }

  $effect(() => {
    if (!open || !root) return;
    return watchFloatingPopup(root, () => (open = false), close, place);
  });
</script>

<div class="time-field" bind:this={root}>
  <button
    type="button"
    class="time-trigger"
    bind:this={trigger}
    aria-label={`${ariaLabel}: ${label}`}
    aria-controls={open ? id : undefined}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={() => (open ? close() : show())}
  >
    <span>{label}</span>
    <Clock size={16} aria-hidden="true" />
  </button>

  {#if open}
    <div
      class="time-popover"
      {id}
      bind:this={popover}
      role="dialog"
      aria-label={ariaLabel}
      style:top={`${pos.top}px`}
      style:left={`${pos.left}px`}
      style:width={`${pos.width}px`}
      style:max-height={`${pos.maxHeight}px`}
    >
      <div class="time-digits">
        <input
          class="time-digit"
          inputmode="numeric"
          aria-label={t("units.hours")}
          value={pad(hours)}
          onchange={(event) => {
            setHours(Number.parseInt(event.currentTarget.value, 10) || 0);
            event.currentTarget.value = pad(hours);
          }}
          onkeydown={acceptTime}
        />
        <span class="time-separator" aria-hidden="true">:</span>
        <input
          class="time-digit"
          inputmode="numeric"
          aria-label={t("units.minutes")}
          value={pad(minutes)}
          onchange={(event) => {
            setMinutes(Number.parseInt(event.currentTarget.value, 10) || 0);
            event.currentTarget.value = pad(minutes);
          }}
          onkeydown={acceptTime}
        />
      </div>

      <label class="time-label">
        {t("units.hours")}
        <input
          class="time-slider"
          type="range"
          min="0"
          max="23"
          value={hours}
          style:--fill={hoursFill}
          oninput={(event) => setHours(Number(event.currentTarget.value))}
          onkeydown={acceptTime}
        />
      </label>

      <label class="time-label">
        {t("units.minutes")}
        <input
          class="time-slider"
          type="range"
          min="0"
          max="59"
          value={minutes}
          style:--fill={minutesFill}
          oninput={(event) => setMinutes(Number(event.currentTarget.value))}
          onkeydown={acceptTime}
        />
      </label>

      <button class="time-close" type="button" onclick={close}>{t("settings.close")}</button>
    </div>
  {/if}
</div>

<style>
  .time-field {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .time-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    text-align: start;
    cursor: pointer;
  }

  .time-trigger:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  .time-trigger:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .time-trigger :global(svg) {
    flex: none;
    color: var(--muted);
  }

  /* Digits over the border, two labelled sliders, the same panel proportions
     as the other popovers. */
  .time-popover {
    position: fixed;
    z-index: 80;
    max-height: 400px;
    padding: 10px 20px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  .time-digits {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 10px;
  }

  .time-digit {
    display: block;
    width: 50px;
    height: 38px;
    padding: 5px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 24px;
    line-height: 28px;
    text-align: center;
  }

  .time-digit:focus {
    border-bottom-color: var(--accent);
    box-shadow: none;
  }

  .time-separator {
    padding-inline: 2px;
    color: var(--text);
    font-size: 24px;
    line-height: 38px;
  }

  .time-label {
    display: block;
    margin-top: 8px;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }

  .time-slider {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    height: 4px;
    margin: 12px 0 4px;
    border: 0;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--accent) var(--fill), var(--panel-2) var(--fill));
    cursor: pointer;
  }

  .time-close {
    display: block;
    margin-block-start: 14px;
    margin-inline-start: auto;
  }

  .time-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: transparent;
  }

  .time-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  }

  .time-slider::-moz-range-track {
    height: 4px;
    border: 0;
    border-radius: 2px;
    background: transparent;
  }

  .time-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  }
</style>
