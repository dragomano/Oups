<script lang="ts">
  import { onMount, untrack } from "svelte";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import RecurrencePicker from "./RecurrencePicker.svelte";
  import PriorityPicker from "./PriorityPicker.svelte";
  import Select from "./Select.svelte";
  import DateField from "./DateField.svelte";
  import TimeField from "./TimeField.svelte";
  import NumberField from "./NumberField.svelte";
  import { api, type EndMode, type Priority, type Recurrence, type Reminder } from "../lib/api";
  import { validateReminderDraft } from "../lib/editor-validation";
  import { t } from "../lib/i18n.svelte";
  import { addDays, declinedWord, isPastDateTime, nowTimeStr, todayStr } from "../lib/time";

  let {
    reminder = null,
    nativeFrame = false,
    onClose,
  }: {
    reminder: Reminder | null;
    nativeFrame?: boolean;
    onClose: () => void;
  } = $props();

  // Each editor window starts with its own independent draft.
  const src = untrack(() => $state.snapshot(reminder)) as Reminder | null;
  // Duplicates arrive pre-filled with an empty id: they are new reminders.
  const isNew = !src || src.id === "";

  let title = $state(src?.title ?? "");
  let note = $state(src?.note ?? "");
  let priority = $state<Priority>(src?.priority ?? "normal");
  let dateStr = $state(src ? (src.startAt.slice(0, 10)) : todayStr());
  let timeStr = $state(src ? src.startAt.slice(11, 16) : nowTimeStr());
  let rec = $state<Recurrence>(
    src?.recurrence ?? { type: "once" },
  );
  let endType = $state<EndMode["type"]>(src?.endMode?.type ?? "never");
  let endCount = $state(src?.endMode?.type === "afterCount" ? src.endMode.n : 1);
  // Until the user picks an end date themselves, it trails the start by one day.
  const storedEnd = src?.endMode?.type === "until" ? src.endMode.date : null;
  let endDatePicked = $state(storedEnd !== null);
  let endDate = $state(storedEnd ?? "");

  $effect(() => {
    if (!endDatePicked) endDate = dateStr ? addDays(dateStr, 1) : "";
  });
  let error = $state("");
  const titleError = $derived(error === "editor.error_title");
  const endTypes = $derived([
    { value: "never", label: t("end.never") },
    { value: "afterCount", label: t("end.after") },
    { value: "until", label: t("end.until") },
  ]);

  function setEndType(next: string) {
    if (next === "never" || next === "afterCount" || next === "until") endType = next;
  }
  let titleInput: HTMLInputElement | undefined;
  let saving = $state(false);
  // A one-shot whose moment is already behind the clock fires on the next
  // scheduler tick, so the dialog says so instead of blocking the date.
  let pastStart = $derived(rec.type === "once" && isPastDateTime(dateStr, timeStr));
  // An end date before the start leaves the rule without a single occurrence.
  let endBeforeStart = $derived(
    endType === "until" && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate < dateStr,
  );
  // The clamp `save` applies, so the hint below and the stored value agree.
  let endCountSafe = $derived(Math.max(1, Math.floor(Number(endCount)) || 1));
  // Every repeat the count allows has already fired, so saving stores no next
  // run: the same state the backend computes.
  let countUsedUp = $derived(endType === "afterCount" && (src?.firedCount ?? 0) >= endCountSafe);

  async function save() {
    if (saving) return;
    error = validateReminderDraft({ title, recurrence: rec, endType, endDate });

    if (error) {
      if (titleError) titleInput?.focus();
      return;
    }

    saving = true;

    try {
      // A one-shot has no end section in the dialog, so leftover state must
      // not reach the backend: a stale end rule would suppress its only fire.
      const endMode: EndMode =
        rec.type === "once"
          ? { type: "never" }
          : endType === "afterCount"
            ? { type: "afterCount", n: endCountSafe }
            : endType === "until"
              ? { type: "until", date: endDate }
              : { type: "never" };
      const built: Reminder = {
        id: src?.id ?? "",
        title: title.trim(),
        note: note.trim(),
        priority,
        startAt: `${dateStr}T${timeStr}:00`,
        recurrence: rec,
        endMode,
        firedCount: src?.firedCount ?? 0,
        // next_due belongs to the backend: an unchanged schedule keeps its
        // stored occurrence, which is how a snooze survives an edit.
        nextDue: null,
        enabled: src ? src.enabled : true,
        completed: src ? src.completed : false,
        createdAt: src?.createdAt ?? "",
        updatedAt: "",
      };
      await api.upsertReminder(built);
      onClose();
    } catch (e) {
      console.error(e);
      error = String(e);
    } finally {
      saving = false;
    }
  }

  async function del() {
    if (!src) return;
    if (confirm(t("msg.delete_confirm"))) {
      await api.deleteReminder(src.id);
      onClose();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !e.defaultPrevented) onClose();
  }

  onMount(() => titleInput?.focus({ preventScroll: true }));
</script>

<form class="dialog reminder-editor" novalidate aria-label={t(isNew ? "editor.new_title" : "editor.edit_title")} onsubmit={(event) => { event.preventDefault(); void save(); }}>
  {#if !nativeFrame}
    <header class="editor-head" data-tauri-drag-region>
      <h2 data-tauri-drag-region>{isNew ? t("editor.new_title") : t("editor.edit_title")}</h2>
      <button class="icon close editor-close" type="button" onclick={onClose} aria-label={t("settings.close")}>
        <X size={16} aria-hidden="true" />
      </button>
    </header>
  {/if}
  <div class="editor-content">
    <div class="editor-form">
    <label class="field">
      <span>{t("editor.title_label")}</span>
      <input
        type="text"
        bind:this={titleInput}
        bind:value={title}
        placeholder={t("editor.title_placeholder")}
        aria-label={t("editor.title_label")}
        aria-invalid={titleError || undefined}
        aria-describedby={titleError ? "title-error" : undefined}
        oninput={(event) => {
          if (titleError && event.currentTarget.value.trim()) error = "";
        }}
      />
      {#if titleError}
        <span class="error" id="title-error" role="alert">{t("editor.error_title")}</span>
      {/if}
    </label>

    <div class="editor-columns">
      <div class="editor-main">
    <label class="field">
      <span>{t("editor.note_label")}</span>
      <textarea rows="2" bind:value={note} placeholder={t("editor.note_placeholder")} aria-label={t("editor.note_label")}></textarea>
    </label>

    <div class="grid2">
      <div class="field">
        <span>{t("editor.date_label")}</span>
        <DateField bind:value={dateStr} min={isNew ? todayStr() : undefined} ariaLabel={t("editor.date_label")} />
      </div>
      <div class="field">
        <span>{t("editor.time_label")}</span>
        <TimeField bind:value={timeStr} ariaLabel={t("editor.time_label")} />
      </div>
    </div>

    {#if pastStart}
      <div class="hint">{t("editor.hint_past_start")}</div>
    {/if}

    <div class="field">
      <span>{t("editor.priority_label")}</span>
      <PriorityPicker bind:priority />
    </div>

      </div>
      <div class="editor-schedule">
    <div class="field">
      <span>{t("editor.recurrence_label")}</span>
      <RecurrencePicker bind:rec startAt={`${dateStr}T${timeStr}:00`} />
    </div>

    {#if rec.type !== "once"}
      <div class="field">
        <span>{t("editor.end_label")}</span>
        <div class="end-row">
          <Select value={endType} onchange={setEndType} ariaLabel={t("editor.end_label")} options={endTypes} />
          {#if endType === "afterCount"}
            <NumberField bind:value={endCount} min={1} ariaLabel={declinedWord("end.count_noun", endCountSafe)} />
            <span class="muted">{declinedWord("end.count_noun", endCountSafe)}</span>
          {:else if endType === "until"}
            <DateField
              bind:value={endDate}
              onchange={() => (endDatePicked = true)}
              ariaLabel={t("end.until")}
            />
          {/if}
        </div>
        {#if endBeforeStart || countUsedUp}
          <div class="hint">
            {t(endBeforeStart ? "editor.hint_end_before_start" : "editor.hint_count_used_up")}
          </div>
        {/if}
      </div>
    {/if}

      </div>
    </div>

    {#if error && !titleError}
      <div class="error">
        {error.startsWith("editor.") || error.startsWith("end.") ? t(error) : error}
      </div>
    {/if}

    </div>
  </div>
    <div class="footer">
      {#if !isNew}
        <button type="button" class="danger delete" onclick={del} aria-label={t("editor.delete")}><Trash2 size={16} /><span>{t("editor.delete")}</span></button>
      {/if}
      <span class="spacer"></span>
      <button type="button" onclick={onClose} aria-label={t("editor.cancel")}>{t("editor.cancel")}</button>
      <button type="submit" class="primary" disabled={saving} aria-label={t("editor.save")}>{t("editor.save")}</button>
    </div>
</form>

<svelte:window onkeydown={onKeydown} />

<style>
  .reminder-editor {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100dvh;
    margin: 0;
    overflow: hidden;
    background: var(--panel);
  }

  .editor-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    gap: 16px;
    padding: 20px 24px 0;
  }

  .editor-close { flex: none; }

  .editor-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px 24px 22px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  .editor-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 286px);
    gap: 30px;
  }

  .editor-main,
  .editor-schedule {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field > span {
    color: var(--muted);
    font-size: 13px;
  }

  .field > input,
  .field > textarea {
    width: 100%;
  }

  textarea {
    height: 130px;
    min-height: 58px;
    max-height: 240px;
  }

  .grid2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .end-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .end-row > :global(.select),
  .end-row > :global(.date-field) { flex: 1; }
  .end-row > :global(.number-field) { flex: none; width: 80px; }
  .muted { color: var(--muted); }
  .error,
  .field > .error { color: var(--danger); font-size: 13px; line-height: 1.35; }
  input[aria-invalid="true"] { border-color: var(--danger); }
  input[aria-invalid="true"]:focus { box-shadow: 0 0 0 2px var(--danger-soft); }
  .hint { color: var(--muted); font-size: 13px; line-height: 1.35; }

  .footer {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
    margin: 0 24px;
    margin-inline-end: calc(24px + var(--editor-gutter, 0px));
    padding: 18px 0 22px;
    border-top: 1px solid var(--border);
    background: var(--panel);
  }

  .spacer { flex: 1; }
  .delete { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }

  @media (max-width: 700px) {
    .editor-columns { grid-template-columns: minmax(0, 1fr); gap: 14px; }
    .editor-form { padding: 18px 16px; gap: 14px; }
    .editor-head { padding: 16px 16px 0; }
    .editor-main,
    .editor-schedule { gap: 14px; }
    textarea { height: 64px; }
    .footer { margin: 0 16px; margin-inline-end: calc(16px + var(--editor-gutter, 0px)); padding: 12px 0 max(14px, env(safe-area-inset-bottom)); }
  }

  @media (max-width: 360px) {
    .grid2 { grid-template-columns: minmax(0, 1fr); }
    .footer > button { flex: 1; min-height: 40px; padding-inline: 8px; }
    .footer > .delete { flex: 0 0 40px; padding: 0; }
    .delete span,
    .spacer { display: none; }
  }

  @media (max-height: 560px) {
    .editor-form { padding-block: 14px; gap: 12px; }
    .editor-head { padding-top: 14px; }
    .editor-main,
    .editor-schedule { gap: 12px; }
    textarea { height: 64px; }
    .footer { padding-block: 12px; }
  }

  @media (pointer: coarse) {
    /* Keep the original priority of this fallback against child controls. */
    :global(.reminder-editor input),
    :global(.reminder-editor button),
    .footer > button { min-height: 44px; }
    .delete { min-width: 44px; }
    .editor-close { inline-size: 44px; block-size: 44px; }
  }
</style>
