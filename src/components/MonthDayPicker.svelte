<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { t, i18n } from "../lib/i18n.svelte";
  import { floatingPanel } from "../lib/floating-panel";
  import { toggleMonthDay } from "../lib/month-days";

  let { days = $bindable(), count }: { days: number[]; count: number } = $props();
  const id = $props.id();
  let button: HTMLButtonElement;
  let panel: HTMLDivElement;
  let open = $state(false);
  let position = $state({ top: 0, left: 0, width: 304, maxHeight: 400 });
  const summary = $derived(new Intl.ListFormat(i18n.lang).format(
    days.map((day) => new Intl.NumberFormat(i18n.lang).format(day)),
  ));

  function place() {
    const anchor = button.getBoundingClientRect();
    position = floatingPanel(
      { left: anchor.left, top: anchor.top, bottom: anchor.bottom, width: Math.min(304, window.innerWidth - 16) },
      panel.scrollHeight + 2,
      window.innerWidth,
      window.innerHeight,
    );
  }

  function toggled(event: ToggleEvent) {
    open = event.newState === "open";
    if (open) {
      place();
      panel.querySelector<HTMLButtonElement>(".active")?.focus({ preventScroll: true });
    }
  }

  $effect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      panel.hidePopover();
      button.focus({ preventScroll: true });
    };
    const resize = () => {
      // The inline grid takes over when the editor becomes wide again.
      if (button.getClientRects().length === 0) panel.hidePopover();
      else place();
    };
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", place, true);
    };
  });
</script>

{#snippet grid()}
  <div class="month-days" role="group" aria-label={t("editor.day_of_month")}>
    {#each Array.from({ length: count }, (_, index) => index + 1) as day (day)}
      <button
        type="button"
        class="day"
        class:active={days.includes(day)}
        aria-label={`${t("editor.day_of_month")} ${day}`}
        aria-pressed={days.includes(day)}
        onclick={() => days = toggleMonthDay(days, day)}
      >{day}</button>
    {/each}
  </div>
{/snippet}

<div class="month-inline">{@render grid()}</div>
<button
  class="month-toggle"
  type="button"
  bind:this={button}
  popovertarget={id}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={`${t("editor.day_of_month")}: ${summary}`}
>
  <span class="month-label">{t("editor.day_of_month")}</span>
  <span class="selected-days">{summary}</span>
  <ChevronDown size={16} />
</button>
<div
  bind:this={panel}
  {id}
  popover="auto"
  role="dialog"
  aria-label={t("editor.day_of_month")}
  tabindex="-1"
  class="month-popover"
  ontoggle={toggled}
  style:top={`${position.top}px`}
  style:left={`${position.left}px`}
  style:width={`${position.width}px`}
  style:max-height={`${position.maxHeight}px`}
>{@render grid()}</div>

<style>
  .month-inline { width: 100%; }
  .month-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .day { min-width: 0; min-height: 34px; padding: 6px 0; text-align: center; color: var(--muted); }
  .day.active { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  .month-toggle { display: none; align-items: center; gap: 10px; width: 100%; text-align: start; min-height: 40px; }
  .month-label { color: var(--muted); flex-shrink: 0; }
  .selected-days { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .month-toggle :global(svg) { flex-shrink: 0; color: var(--muted); }
  .month-popover { position: fixed; inset: auto; margin: 0; padding: 12px; overflow-y: auto; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); }
  .month-popover .day { min-height: 40px; }
  @media (max-width: 700px) {
    .month-inline { display: none; }
    .month-toggle { display: inline-flex; }
  }
  @media (pointer: coarse) {
    .day, .month-popover .day, .month-toggle { min-height: 44px; }
  }
</style>
