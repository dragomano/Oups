<script lang="ts">
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { untrack } from "svelte";
  import { i18n, t } from "../lib/i18n.svelte";
  import { floatingPanel } from "../lib/floating-panel";

  type Parts = { year: number; month: number; day: number };

  let {
    value = $bindable(""),
    min = "",
    ariaLabel = "",
    onchange,
  }: {
    value?: string;
    min?: string;
    ariaLabel?: string;
    onchange?: (value: string) => void;
  } = $props();

  const WIDTH = 300;

  const pad = (n: number) => String(n).padStart(2, "0");

  function parseDate(text: string): Parts | null {
    const [year, month, day] = text.split("-").map((part) => Number.parseInt(part, 10));

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

    return { year, month: month - 1, day };
  }

  function iso(parts: Parts): string {
    return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;
  }

  function fromDate(date: Date): Parts {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
  }

  const today = fromDate(new Date());
  const initial = parseDate(value);
  const minParts = $derived(parseDate(min));

  let selected = $state<Parts | null>(initial);
  let viewYear = $state(initial?.year ?? today.year);
  let viewMonth = $state(initial?.month ?? today.month);
  let open = $state(false);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let popover = $state<HTMLElement>();
  let pos = $state({ top: 0, left: 0, width: WIDTH, maxHeight: 480 });

  $effect(() => {
    const next = value;

    untrack(() => {
      if ((selected ? iso(selected) : "") !== next) selected = parseDate(next);
    });
  });

  const lang = $derived(i18n.lang);
  const display = $derived(selected ? `${pad(selected.day)}.${pad(selected.month + 1)}.${selected.year}` : "");

  const monthTitle = $derived.by(() => {
    const label = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(
      new Date(viewYear, viewMonth, 1),
    );

    return label.charAt(0).toLocaleUpperCase(lang) + label.slice(1);
  });

  const weekdays = $derived.by(() => {
    // 2020-01-05 was a Sunday; the calendar starts the week there.
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(lang, { weekday: "short" })
        .format(new Date(2020, 0, 5 + index))
        .replace(/^./, (char) => char.toLocaleUpperCase(lang)),
    );
  });

  const weeks = $derived.by(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(viewYear, viewMonth, 1 - first.getDay());
    const days: Date[] = [];

    for (let index = 0; index < 42; index++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }

    const rows: Date[][] = [];

    for (let index = 0; index < 6; index++) rows.push(days.slice(index * 7, index * 7 + 7));

    return rows;
  });

  function isSame(date: Date, parts: Parts | null): boolean {
    return Boolean(
      parts && date.getFullYear() === parts.year && date.getMonth() === parts.month && date.getDate() === parts.day,
    );
  }

  // ISO dates are zero-padded, so their text order is their date order.
  function isBeforeMin(date: Date): boolean {
    return Boolean(minParts) && iso(fromDate(date)) < min;
  }

  function emit(parts: Parts | null) {
    selected = parts;
    value = parts ? iso(parts) : "";
    onchange?.(value);
  }

  function close() {
    open = false;
    trigger?.focus();
  }

  function choose(date: Date) {
    const next = fromDate(date);

    viewYear = next.year;
    viewMonth = next.month;
    emit(next);
    close();
  }

  function clear() {
    emit(null);
    close();
  }

  function show() {
    if (selected) {
      viewYear = selected.year;
      viewMonth = selected.month;
    }

    open = true;
  }

  function toggle() {
    if (open) open = false;
    else show();
  }

  /** The popover is position: fixed, so the editor's scroll container cannot clip it. */
  function place() {
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const fitted = floatingPanel(
      { left: rect.left, top: rect.top, bottom: rect.bottom, width: Math.min(WIDTH, window.innerWidth - 16) },
      popover?.offsetHeight ?? 320,
      window.innerWidth,
      window.innerHeight,
    );

    pos = { ...fitted, maxHeight: Math.min(480, fitted.maxHeight) };
  }

  function shift(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);

    viewYear = next.getFullYear();
    viewMonth = next.getMonth();
  }

  function dayLabel(date: Date): string {
    return new Intl.DateTimeFormat(lang, { dateStyle: "full" }).format(date);
  }

  $effect(() => {
    if (!open || !popover) return;

    place();
    const frame = requestAnimationFrame(place);

    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) open = false;
    };
    const onScroll = (event: Event) => {
      const target = event.target;

      if (target instanceof Node && root?.contains(target)) return;

      open = false;
    };
    const onKeydown = (event: KeyboardEvent) => {
      // Only the calendar closes: the editor also listens for Escape.
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  });
</script>

<div class="date-field" bind:this={root}>
  <button
    type="button"
    class="date-trigger"
    bind:this={trigger}
    aria-label={ariaLabel}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={toggle}
  >
    <span>{display}</span>
    <CalendarDays size={16} aria-hidden="true" />
  </button>

  {#if open}
    <div
      class="date-popover"
      bind:this={popover}
      role="dialog"
      aria-label={ariaLabel}
      style:top={`${pos.top}px`}
      style:left={`${pos.left}px`}
      style:width={`${pos.width}px`}
      style:max-height={`${pos.maxHeight}px`}
    >
      <div class="date-head">
        <button type="button" class="date-nav" aria-label={t("date.prev_month")} onclick={() => shift(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div class="date-month">{monthTitle}</div>
        <button type="button" class="date-nav" aria-label={t("date.next_month")} onclick={() => shift(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div class="date-weekdays" aria-hidden="true">
        {#each weekdays as weekday (weekday)}
          <span>{weekday}</span>
        {/each}
      </div>

      <div class="date-grid">
        {#each weeks as week, row (row)}
          {#each week as date (date.getTime())}
            {@const outside = date.getMonth() !== viewMonth}
            {@const weekend = date.getDay() === 0 || date.getDay() === 6}
            {@const active = isSame(date, selected)}
            <button
              type="button"
              class="date-day"
              class:outside
              class:weekend
              class:selected={active}
              class:today={isSame(date, today)}
              disabled={isBeforeMin(date)}
              aria-label={dayLabel(date)}
              aria-pressed={active}
              onclick={() => choose(date)}
            >
              {date.getDate()}
            </button>
          {/each}
        {/each}
      </div>

      <div class="date-actions">
        <button type="button" onclick={clear}>{t("date.clear")}</button>
        <button type="button" onclick={() => choose(new Date())}>{t("date.today")}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .date-field {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .date-trigger {
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

  .date-trigger:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  .date-trigger:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
    outline: none;
  }

  .date-trigger :global(svg) {
    flex: none;
    color: var(--muted);
  }

  /* A compact panel with an accent month title and selected day, muted adjacent
     months and the weekend days in the accent. */
  .date-popover {
    position: fixed;
    z-index: 80;
    max-height: 480px;
    padding: 10px 12px 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  .date-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
  }

  .date-month {
    flex: 1;
    color: var(--accent);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
  }

  .date-nav {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .date-nav:hover {
    background: var(--panel-2);
    color: var(--text);
  }

  .date-weekdays,
  .date-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }

  .date-weekdays {
    padding-bottom: 4px;
    color: var(--muted);
    font-size: 11px;
    text-align: center;
  }

  .date-weekdays span {
    padding: 2px 0;
  }

  .date-day {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .date-day:hover:not(:disabled) {
    background: var(--panel-2);
  }

  .date-day.outside {
    color: var(--muted);
    opacity: 0.55;
  }

  .date-day.weekend {
    color: var(--accent);
  }

  .date-day.today:not(.selected) {
    background: var(--panel-2);
    font-weight: 600;
  }

  .date-day.selected,
  .date-day.selected:hover {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .date-day:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .date-actions {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    padding-top: 8px;
  }

  .date-actions button {
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .date-actions button:hover {
    text-decoration: underline;
  }
</style>
