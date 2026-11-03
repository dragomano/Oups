<script lang="ts">
  import { t, i18n } from "../lib/i18n.svelte";
  import type { Recurrence } from "../lib/api";
  import { daysInMonth, everyPrefix, formatUnit, parseLocal } from "../lib/time";
  import MonthDayPicker from "./MonthDayPicker.svelte";

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

  function toggleWeekday(w: number) {
    if (rec.type !== "weekly") return;
    const set = new Set(rec.weekdays);
    if (set.has(w)) set.delete(w);
    else set.add(w);
    rec.weekdays = [...set].sort((a, b) => a - b);
  }

</script>

<div class="picker">
  <select value={rec.type} onchange={(e) => setType(e.currentTarget.value)} aria-label={t("editor.recurrence_label")}>
    {#each types as tp (tp.id)}
      <option value={tp.id}>{t(tp.label)}</option>
    {/each}
  </select>

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
      <select bind:value={rec.month} aria-label={t("editor.month")}>
        {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}
          <option value={m}>{monthName(m)}</option>
        {/each}
      </select>
    </label>
    <label class="inline">
      <span>{t("editor.day")}</span>
      <input type="number" min="1" max="31" bind:value={rec.day} aria-label={t("editor.day")} />
    </label>
  {:else if rec.type === "interval"}
    <label class="inline">
      <span>{everyPrefix(rec.unit, rec.n ?? 1)}</span>
      <input type="number" min="1" bind:value={rec.n} aria-label={t("editor.every")} />
      <select bind:value={rec.unit} aria-label={t("rec.interval")}>
        {#each units as u (u)}
          <option value={u}>{formatUnit(u, rec.n ?? 1)}</option>
        {/each}
      </select>
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

  .inline input[type="number"] {
    width: 76px;
  }

  .inline select { flex: 1; min-width: 0; }
  @media (pointer: coarse) { .wd { min-height: 44px; } }
</style>
