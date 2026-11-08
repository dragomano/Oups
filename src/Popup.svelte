<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { api, type PopupData, type Reminder, type SnoozeUnit } from "./lib/api";
  import { loadLocale, t } from "./lib/i18n.svelte";
  import { applyTheme } from "./lib/theme";
  import X from "@lucide/svelte/icons/x";
  import { fmtDateTime, fmtTime, parseLocal, recurrenceText } from "./lib/time";
  import { isValidSnoozeCount, SNOOZE_DEFAULT, SNOOZE_MAX, SNOOZE_MIN, SNOOZE_UNITS, snoozeUnitLabel } from "./lib/snooze";
  import NoteLinks from "./components/NoteLinks.svelte";

  let data = $state<PopupData | null>(null);
  let list = $state<Reminder[]>([]);

  let delayCount = $state<number | undefined>(SNOOZE_DEFAULT);
  let delayUnit = $state<SnoozeUnit>("minutes");
  const validDelay = $derived(isValidSnoozeCount(delayCount));

  onMount(async () => {
    const s = await api.getSettings();

    applyTheme(s.theme, s.accent);
    await loadLocale(s.language);
    data = await api.getPopupData();

    if (data.kind === "missed") list = data.reminders;

    // The window is created hidden; reveal it once the content is rendered,
    // so no blank WebView frame flashes.
    void api.popupWindowReady();
  });

  function closeSelf() {
    getCurrentWebviewWindow().close();
  }

  async function applyChoice() {
    if (!isValidSnoozeCount(delayCount)) return;

    if (data?.kind === "single") await api.snooze(data.reminder.id, delayCount, delayUnit);
    else if (data?.kind === "missed") await api.snoozeMissedAll(delayCount, delayUnit);
    else return;

    closeSelf();
  }

  async function dismissOne(id: string) {
    list = list.filter((r) => r.id !== id);
    await api.dismissMissedOne(id);
  }

  async function dismissAll() {
    await api.dismissMissed();
    closeSelf();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (data?.kind === "single") closeSelf();
      else if (data?.kind === "missed") dismissAll();
    }
  }

  const single = $derived(data?.kind === "single" ? (data as { reminder: Reminder }).reminder : null);
  const isMissed = $derived(data?.kind === "missed");

  const start = $derived(single ? parseLocal(single.startAt) : null);

  // High and Critical both mark the popup as important; Critical is the level
  // the Eisenhower matrix treats as "do it now", so it gets the stronger color.
  const isCritical = $derived(single?.priority === "critical");
  const isHigh = $derived(single?.priority === "high" || single?.priority === "critical");
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Keep the delay controls compact; the native unit menu opens outside the layout. -->
{#snippet delayControls(applyLabel: string, closeLabel: string, onClose: () => void)}
  <div class="actions">
    <form class="delay-form" onsubmit={(event) => { event.preventDefault(); void applyChoice(); }}>
      <div class="delay-row">
        <input
          type="number"
          min={SNOOZE_MIN}
          max={SNOOZE_MAX}
          step="1"
          required
          bind:value={delayCount}
          aria-label={t("popup.snooze_count")}
          aria-invalid={!validDelay}
          aria-describedby={!validDelay ? "snooze-error" : undefined}
        />
        <select bind:value={delayUnit} aria-label={t("popup.snooze_unit")}>
          {#each SNOOZE_UNITS as unit (unit)}
            <option value={unit}>{snoozeUnitLabel(unit, delayCount)}</option>
          {/each}
        </select>
        <button type="submit" class="primary" disabled={!validDelay} aria-label={applyLabel}>{applyLabel}</button>
      </div>
      {#if !validDelay}
        <p class="delay-error" id="snooze-error" role="alert">{t("popup.snooze_range", { min: SNOOZE_MIN, max: SNOOZE_MAX })}</p>
      {/if}
    </form>
    <button onclick={onClose} aria-label={closeLabel}>{closeLabel}</button>
  </div>
{/snippet}

{#if single}
  <div class="wrap" class:high={isHigh && !isCritical} class:critical={isCritical}>
    {#if isCritical}
      <div class="badge danger">{t("priority.badge.critical")}</div>
    {:else if isHigh}
      <div class="badge warn">{t("priority.badge.high")}</div>
    {/if}
    <h1>{single.title}</h1>
    {#if single.note}
      <p class="note">
        <NoteLinks note={single.note} />
      </p>
    {/if}
    <div class="meta">
      {#if start}<span>{fmtTime(start)}</span> ·{/if}
      <span>{recurrenceText(single.recurrence)}</span>
    </div>

    {@render delayControls(t("popup.snooze"), t("popup.close"), closeSelf)}
  </div>
{:else if isMissed}
  <div class="wrap">
    <h1>{t("popup.missed_title")}</h1>
    <ul class="missed-list">
      {#each list as r (r.id)}
        <li>
          <div class="m-main">
            <div class="m-title">{r.title}</div>
            {#if r.note}
              <div class="m-note">
                <NoteLinks note={r.note} />
              </div>
            {/if}
            <div class="m-time">{r.nextDue ? fmtDateTime(parseLocal(r.nextDue)!) : ""}</div>
          </div>
          <button class="icon icon-close" title={t("popup.close")} aria-label={t("popup.close")} onclick={() => dismissOne(r.id)}><X size={16} /></button>
        </li>
      {/each}
    </ul>
    {@render delayControls(t("popup.snooze_all"), t("popup.close_all"), dismissAll)}
  </div>
{:else}
  <div class="wrap muted">…</div>
{/if}

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 20px;
    height: calc(100vh - 0px);
  }

  .wrap.high {
    border-top: 3px solid var(--warn);
  }

  .wrap.critical {
    border-top: 3px solid var(--danger);
  }

  h1 {
    margin: 0;
    font-size: 20px;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .badge {
    align-self: flex-start;
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 20px;
  }

  .badge.danger {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .badge.warn {
    background: var(--warn-soft);
    color: color-mix(in srgb, var(--warn) 75%, var(--text));
  }

  .note {
    margin: 0;
    color: var(--muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .meta {
    color: var(--muted);
    font-size: 13.5px;
  }

  .actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .actions button {
    padding: 10px 12px;
  }

  .delay-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* The unit picker takes the slack; the count and action keep their width. */
  .delay-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .delay-row select {
    flex: 1 1 auto;
    min-width: 0;
    padding: 9px 10px;
  }

  .delay-row button {
    flex: none;
  }

  .delay-row input {
    flex: none;
    width: 6em;
    padding: 9px 10px;
    font-variant-numeric: tabular-nums;
  }

  .delay-error {
    margin: 0;
    color: var(--danger);
    font-size: 13px;
  }

  @media (max-width: 380px) {
    .delay-row {
      flex-wrap: wrap;
    }

    .delay-row button {
      width: 100%;
    }
  }

  .missed-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .missed-list li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
  }

  /* Same close icon as the list's delete button replaced: a Lucide SVG
     centers itself in the fixed square, no ink correction needed. */
  .icon-close {
    color: var(--muted);
  }

  .icon-close:hover {
    color: var(--text);
  }

  .m-main {
    flex: 1;
    min-width: 0;
  }

  .m-title {
    font-weight: 600;
  }

  .m-note {
    color: var(--muted);
    font-size: 13px;
    margin-top: 2px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .m-time {
    color: var(--muted);
    font-size: 12.5px;
    margin-top: 3px;
  }

  .muted {
    color: var(--muted);
  }
</style>
