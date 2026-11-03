<script lang="ts">
  import { onMount, untrack } from "svelte";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import "./reminder-editor.css";
  import RecurrencePicker from "./RecurrencePicker.svelte";
  import PriorityPicker from "./PriorityPicker.svelte";
  import { api, type EndMode, type Priority, type Recurrence, type Reminder } from "../lib/api";
  import { validateReminderDraft } from "../lib/editor-validation";
  import { t } from "../lib/i18n.svelte";
  import { declinedWord, isPastDateTime, nowTimeStr, todayStr } from "../lib/time";

  let {
    reminder = null,
    onClose,
  }: {
    reminder: Reminder | null;
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
  let endType = $state<"never" | "afterCount" | "until">(src?.endMode?.type ?? "never");
  let endCount = $state(src?.endMode?.type === "afterCount" ? src.endMode.n : 1);
  let endDate = $state(src?.endMode?.type === "until" ? src.endMode.date : "");
  let error = $state("");
  const titleError = $derived(error === "editor.error_title");
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
  <header class="editor-head" data-tauri-drag-region>
    <h2 data-tauri-drag-region>{isNew ? t("editor.new_title") : t("editor.edit_title")}</h2>
    <button class="icon close editor-close" type="button" onclick={onClose} aria-label={t("settings.close")}>
      <X size={16} aria-hidden="true" />
    </button>
  </header>
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
      <label class="field">
        <span>{t("editor.date_label")}</span>
        <input type="date" bind:value={dateStr} min={isNew ? todayStr() : undefined} aria-label={t("editor.date_label")} />
      </label>
      <label class="field">
        <span>{t("editor.time_label")}</span>
        <input type="time" bind:value={timeStr} aria-label={t("editor.time_label")} />
      </label>
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
          <select bind:value={endType} aria-label={t("editor.end_label")}>
            <option value="never">{t("end.never")}</option>
            <option value="afterCount">{t("end.after")}</option>
            <option value="until">{t("end.until")}</option>
          </select>
          {#if endType === "afterCount"}
            <input type="number" min="1" bind:value={endCount} aria-label={declinedWord("end.count_noun", endCountSafe)} />
            <span class="muted">{declinedWord("end.count_noun", endCountSafe)}</span>
          {:else if endType === "until"}
            <input type="date" bind:value={endDate} aria-label={t("end.until")} />
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
