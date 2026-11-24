<script lang="ts">
  import { onMount, tick } from "svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { api, type PopupData, type Reminder, type SnoozeUnit } from "./lib/api";
  import { loadLocale, t } from "./lib/i18n.svelte";
  import { applyTheme } from "./lib/theme";
  import X from "@lucide/svelte/icons/x";
  import { fmtDateTime, fmtTime, parseLocal, recurrenceText } from "./lib/time";
  import { isValidSnoozeCount, SNOOZE_DEFAULT, SNOOZE_MAX, SNOOZE_MIN, SNOOZE_UNITS, snoozeUnitLabel } from "./lib/snooze";
  import NoteLinks from "./components/NoteLinks.svelte";
  import NumberField from "./components/NumberField.svelte";
  import Select from "./components/Select.svelte";

  const id = $props.id();
  let heading = $state<HTMLHeadingElement>();
  let missedList = $state<HTMLUListElement>();
  let pending = $state(false);
  let data = $state<PopupData | null>(null);
  let list = $state<Reminder[]>([]);

  let delayCount = $state<number>(SNOOZE_DEFAULT);
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
    await tick();
    heading?.focus({ preventScroll: true });
    void api.popupWindowReady();
  });

  function closeSelf() {
    getCurrentWebviewWindow().close();
  }

  async function applyChoice() {
    if (!isValidSnoozeCount(delayCount) || pending || !data) return;
    pending = true;
    try {
      if (data.kind === "single") await api.snooze(data.reminder.id, delayCount, delayUnit);
      else await api.snoozeMissedAll(delayCount, delayUnit);
      closeSelf();
    } catch (error) {
      alert(t("msg.action_failed", { err: String(error) }));
    } finally {
      pending = false;
    }
  }

  async function dismissOne(reminderId: string, button: HTMLButtonElement) {
    try {
      await api.dismissMissedOne(reminderId);
      const index = list.findIndex((reminder) => reminder.id === reminderId);
      const restoreFocus = document.activeElement === button;
      list = list.filter((reminder) => reminder.id !== reminderId);
      if (restoreFocus && list.length) {
        await tick();
        if (document.activeElement === document.body) {
          missedList?.querySelectorAll("button")[Math.min(index, list.length - 1)]?.focus();
        }
      }
    } catch (error) {
      alert(t("msg.action_failed", { err: String(error) }));
    }
  }

  async function dismissAll() {
    try {
      await api.dismissMissed();
      closeSelf();
    } catch (error) {
      alert(t("msg.action_failed", { err: String(error) }));
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !e.defaultPrevented) {
      if (data?.kind === "single") closeSelf();
      else if (data?.kind === "missed") dismissAll();
    }
  }

  const single = $derived(data?.kind === "single" ? data.reminder : null);
  const isMissed = $derived(data?.kind === "missed");

  const title = $derived(data ? (single?.title ?? t("popup.missed_title")) : "");
  const start = $derived(single ? parseLocal(single.startAt) : null);

  // High and Critical both mark the popup as important; Critical is the level
  // the Eisenhower matrix treats as "do it now", so it gets the stronger color.
  const isCritical = $derived(single?.priority === "critical");
  const isHigh = $derived(single?.priority === "high" || single?.priority === "critical");
</script>

<svelte:head><title>{title}</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<!-- Keep the delay controls compact; the unit menu opens outside the layout. -->
{#snippet delayControls(applyLabel: string, closeLabel: string, onClose: () => void)}
  <div class="actions">
    <form class="delay-form" onsubmit={(event) => { event.preventDefault(); void applyChoice(); }}>
      <div class="delay-row">
        <NumberField bind:value={delayCount} min={SNOOZE_MIN} max={SNOOZE_MAX} ariaLabel={t("popup.snooze_count")} ariaDescribedBy={!validDelay ? `${id}-delay-error` : undefined} />
        <Select
          value={delayUnit}
          onchange={(unit) => (delayUnit = unit as SnoozeUnit)}
          options={SNOOZE_UNITS.map((unit) => ({ value: unit, label: snoozeUnitLabel(unit, delayCount) }))}
          ariaLabel={t("popup.snooze_unit")}
        />
        <button type="submit" class="primary" disabled={!validDelay || pending} aria-label={applyLabel}>{applyLabel}</button>
      </div>
      {#if !validDelay}
        <p class="delay-error" id={`${id}-delay-error`} role="alert">{t("popup.snooze_range", { min: SNOOZE_MIN, max: SNOOZE_MAX })}</p>
      {/if}
    </form>
    <button onclick={onClose} aria-label={closeLabel}>{closeLabel}</button>
  </div>
{/snippet}

{#if single}
  <main class="wrap" class:high={isHigh && !isCritical} class:critical={isCritical}>
    {#if isCritical}
      <div class="badge danger" id={`${id}-priority`}>{t("priority.badge.critical")}</div>
    {:else if isHigh}
      <div class="badge warn" id={`${id}-priority`}>{t("priority.badge.high")}</div>
    {/if}
    <h1 bind:this={heading} tabindex="-1" aria-describedby={isHigh ? `${id}-priority` : undefined}>{title}</h1>
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
  </main>
{:else if isMissed}
  <main class="wrap">
    <h1 bind:this={heading} tabindex="-1">{title}</h1>
    <ul class="missed-list" role="list" bind:this={missedList}>
      {#each list as r (r.id)}
        {@const closeLabel = `${t("popup.close")}: ${r.title}`}
        <li>
          <div class="m-main">
            <h2 class="m-title">{r.title}</h2>
            {#if r.note}
              <div class="m-note">
                <NoteLinks note={r.note} />
              </div>
            {/if}
            <div class="m-time">{r.nextDue ? fmtDateTime(parseLocal(r.nextDue)!) : ""}</div>
          </div>
          <button class="icon icon-close" title={closeLabel} aria-label={closeLabel}
            onclick={(event) => void dismissOne(r.id, event.currentTarget)}><X size={16} aria-hidden="true" /></button>
        </li>
      {/each}
    </ul>
    {@render delayControls(t("popup.snooze_all"), t("popup.close_all"), dismissAll)}
  </main>
{:else}
  <div class="wrap muted" aria-hidden="true">…</div>
{/if}

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 20px;
    height: calc(100vh - 0px);
    overflow-y: auto;
  }

  h1:focus { outline: none; }

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

  .delay-row > :global(.select) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .delay-row button {
    flex: none;
  }

  .delay-row > :global(.number-field) {
    flex: none;
    width: 6em;
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
    margin: 0;
    font-size: inherit;
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
