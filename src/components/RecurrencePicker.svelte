<script lang="ts">
  import { t, i18n } from "../lib/i18n.svelte";
  import type { IntervalUnit, Recurrence } from "../lib/api";
  import { daysInMonth, everyPrefix, formatUnit, parseLocal } from "../lib/time";
  import MonthDayPicker from "./MonthDayPicker.svelte";
  import Select from "./Select.svelte";
  import NumberField from "./NumberField.svelte";

  let {
    rec = $bindable(),
    startAt,
  }: {
    rec: Recurrence;
    startAt: string;
  } = $props();

  const types = [
    { id: "once", label: "rec.once" },
    { id: "daily", label: "rec.daily" },
    { id: "weekly", label: "rec.weekly" },
    { id: "monthly", label: "rec.monthly" },
    { id: "yearly", label: "rec.yearly" },
    { id: "interval", label: "rec.interval" },
  ] as const;

  const units = ["minutes", "hours", "days", "weeks", "months", "years"] as const;

  const start = $derived(parseLocal(startAt));
  const monthDayCount = $derived(start ? daysInMonth(start.getFullYear(), start.getMonth() + 1) : 31);

  $effect(() => {
    const count = monthDayCount;
    const monthly = rec.type === "monthly" ? rec : null;

    if (!monthly) return;

    const validDays = monthly.days.filter((day) => day <= count);

    if (validDays.length === 0) validDays.push(Math.min(start?.getDate() ?? 1, count));
    if (
      validDays.length !== monthly.days.length ||
      validDays.some((day, index) => day !== monthly.days[index])
    ) {
      monthly.days = validDays;
    }
  });

  function monthName(m: number): string {
    return new Intl.DateTimeFormat(i18n.lang, { month: "long" }).format(new Date(2026, m - 1, 1));
  }

  const typeOptions = $derived(types.map((tp) => ({ value: tp.id, label: t(tp.label) })));
  const monthOptions = $derived(
    Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({ value: String(m), label: monthName(m) })),
  );

  function setType(v: string) {
    switch (v) {
      case "once":
        rec = { type: "once" };
        break;
      case "daily":
        rec = { type: "daily" };
        break;
      case "weekly":
        rec = { type: "weekly", weekdays: rec.type === "weekly" ? [...rec.weekdays] : [1] };
        break;
      case "monthly":
        rec = { type: "monthly", days: rec.type === "monthly" ? [...rec.days] : [start?.getDate() ?? 1] };
        break;
      case "yearly":
        rec = {
          type: "yearly",
          month: rec.type === "yearly" ? rec.month : (start?.getMonth() ?? 0) + 1,
          day: rec.type === "yearly" ? rec.day : (start?.getDate() ?? 1),
        };
        break;
      case "interval":
        rec = {
          type: "interval",
          unit: rec.type === "interval" ? rec.unit : "minutes",
          n: rec.type === "interval" ? rec.n : 15,
        };
        break;
    }
  }

  function setMonth(v: string) {
    if (rec.type === "yearly") rec.month = Number(v);
  }

  function setUnit(v: string) {
    if (rec.type === "interval") rec.unit = v as IntervalUnit;
  }

  function toggleWeekday(w: number) {
    if (rec.type !== "weekly") return;
    const set = new Set(rec.weekdays);
    if (set.has(w)) set.delete(w);
    else set.add(w);
    rec.weekdays = [...set].sort((a, b) => a - b);
  }

</script>

<div class="picker">
  <Select value={rec.type} onchange={setType} options={typeOptions} ariaLabel={t("editor.recurrence_label")} />

  {#if rec.type === "weekly"}
    <div class="weekdays" role="group" aria-label={t("rec.weekly")}>
      {#each [1, 2, 3, 4, 5, 6, 7] as w (w)}
        <button
          type="button"
          class="wd"
          class:active={rec.weekdays.includes(w)}
          aria-label={t(`weekdays_full.${w}`)}
          aria-pressed={rec.weekdays.includes(w)}
          onclick={() => toggleWeekday(w)}
        >
          {t(`weekdays_short.${w}`)}
        </button>
      {/each}
    </div>
  {:else if rec.type === "monthly"}
    <MonthDayPicker bind:days={rec.days} count={monthDayCount} />
  {:else if rec.type === "yearly"}
    <label class="inline">
      <span>{t("editor.month")}</span>
      <Select value={String(rec.month)} onchange={setMonth} options={monthOptions} ariaLabel={t("editor.month")} />
    </label>
    <label class="inline">
      <span>{t("editor.day")}</span>
      <NumberField bind:value={rec.day} min={1} max={31} ariaLabel={t("editor.day")} />
    </label>
  {:else if rec.type === "interval"}
    {@const n = rec.n || 1}
    <label class="inline">
      <span>{everyPrefix(rec.unit, n)}</span>
      <NumberField bind:value={rec.n} min={1} ariaLabel={t("editor.every")} />
      <Select
        value={rec.unit}
        onchange={setUnit}
        options={units.map((u) => ({ value: u, label: formatUnit(u, n) }))}
        ariaLabel={t("rec.interval")}
      />
    </label>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    min-width: 0;
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }

  .wd {
    min-width: 0;
    min-height: 34px;
    padding: 6px 0;
    text-align: center;
    color: var(--muted);
  }

  .wd.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .inline {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--muted);
  }

  .inline > :global(.number-field) {
    flex: none;
    width: 76px;
  }

  .inline > :global(.select) { flex: 1; min-width: 0; }
  @media (pointer: coarse) { .wd { min-height: 44px; } }
</style>
