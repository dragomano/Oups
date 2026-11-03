<script lang="ts">
  import NoteLinks from "./NoteLinks.svelte";
  import { api, type Reminder } from "../lib/api";
  import { clock } from "../lib/clock.svelte";
  import { t } from "../lib/i18n.svelte";
  import { dueKind } from "../lib/matrix";
  import { fmtDateTime, fmtRelative, parseLocal, recurrenceText } from "../lib/time";
  import Copy from "@lucide/svelte/icons/copy";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    r,
    onEdit,
    onDuplicate,
  }: {
    r: Reminder;
    onEdit: () => void;
    onDuplicate: () => void;
  } = $props();

  const next = $derived(parseLocal(r.nextDue));
  const inactive = $derived(r.completed || !r.enabled);
  /**
   * The next run is behind the clock. `dueKind` is the matrix's own rule for
   * it — reused rather than restated here, so the two cannot drift apart.
   * An inactive reminder is left out: it will not fire while it is off or
   * completed, so calling it overdue would be a lie.
   */
  const overdue = $derived(!inactive && dueKind(r.nextDue, clock.now) === "overdue");

  function toggle() {
    api.setEnabled(r.id, !r.enabled).catch((e) => console.error(e));
  }

  function del() {
    if (confirm(t("msg.delete_confirm"))) {
      api.deleteReminder(r.id).catch((e) => console.error(e));
    }
  }
</script>

<li class="row" class:inactive class:overdue class:high={r.priority === "high" && !inactive} class:critical={r.priority === "critical" && !inactive}>
  <span class="prio-icon prio-{r.priority}" title={t(`priority.${r.priority}`)}>
    {#if r.priority === "critical"}
      <ChevronsUp size={18} strokeWidth={2.5} />
    {:else if r.priority === "high"}
      <ChevronUp size={18} strokeWidth={2.5} />
    {:else if r.priority === "normal"}
      <Circle size={16} />
    {:else}
      <ChevronDown size={18} strokeWidth={2.5} />
    {/if}
  </span>

  <div class="title-line">
    <span class="title">{r.title}</span>
    {#if overdue}
      <span class="chip overdue-chip">{t("list.overdue")}</span>
    {/if}
    {#if !r.enabled}
      <span class="chip off-chip">{t("list.disabled")}</span>
    {/if}
    {#if r.completed}
      <span class="chip done-chip">{t("list.completed")}</span>
    {/if}
  </div>

  <div class="meta">
    <span class="rec">{recurrenceText(r.recurrence)}</span>
  </div>

  <!-- The note is a column of the row, so it is rendered even when empty:
       without it the date block would stick to the title in rows that have
       no note, and the right edge of the list would come apart. -->
  <span class="note" title={r.note}>
    <NoteLinks note={r.note} />
  </span>

  <div class="when">
    {#if r.completed}
      <span class="muted">{t("list.completed")}</span>
    {:else if !r.enabled}
      <span class="muted">{t("list.disabled")}</span>
    {:else if next}
      <span class="muted">{t("list.next_run")}</span>
      <span class="next">{fmtDateTime(next)}</span>
      <span class="rel">{fmtRelative(next, clock.now)}</span>
    {/if}
  </div>

  <div class="actions">
    <input class="switch" type="checkbox" role="switch" checked={r.enabled} onchange={toggle} title={r.enabled ? t("list.disable") : t("list.enable")} aria-label={r.enabled ? t("list.disable") : t("list.enable")} />
    <button class="icon icon-edit" onclick={onEdit} title={t("list.edit")} aria-label={t("list.edit")}><Pencil size={16} /></button>
    <button class="icon icon-copy" onclick={onDuplicate} title={t("list.duplicate")} aria-label={t("list.duplicate")}><Copy size={16} /></button>
    <button class="icon danger icon-delete" onclick={del} title={t("list.delete")} aria-label={t("list.delete")}><Trash2 size={16} /></button>
  </div>
</li>

<style>
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) max-content;
    grid-template-rows: auto auto 1fr;
    grid-template-areas:
      "dot title when"
      "dot meta when"
      "dot note actions";
    align-items: start;
    column-gap: 12px;
    row-gap: 3px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }

  /* 3px stripe + 12px padding holds the content box where 1px + 14px of a
     normal row does, so titles of striped and plain rows line up. */
  .row.high {
    border-left: 3px solid var(--warn);
    padding-left: 12px;
  }

  .row.critical {
    border-left: 3px solid var(--danger);
    padding-left: 12px;
  }

  .row.inactive {
    opacity: 0.55;
  }

  .row.overdue {
    background: color-mix(in srgb, var(--danger) 6%, var(--panel));
  }

  .row.overdue .when .rel {
    color: var(--danger);
    font-weight: 600;
  }

  /* Overdue is red and bold, the way the matrix reads it. The tint of the
     whole row catches the eye in a list whose date column sits far right. */
  .overdue-chip {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .prio-icon {
    grid-area: dot;
    margin-top: 4px;
  }

  .title-line {
    grid-area: title;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    min-width: 0;
  }

  .chip {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 20px;
    flex: none;
  }

  .high-chip {
    background: var(--warn-soft);
    color: color-mix(in srgb, var(--warn) 75%, var(--text));
  }

  .critical-chip {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .low-chip,
  .off-chip,
  .done-chip {
    background: var(--panel-2);
    color: var(--muted);
  }

  .meta {
    grid-area: meta;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
    min-width: 0;
  }

  /* Full weekday names ("Понедельник, Среда") are wider than the short labels,
     so let them shrink and wrap instead of squeezing the note out. */
  .rec {
    flex: 0 1 auto;
    min-width: 0;
  }

  /* The note lives in the free middle cell between the recurrence and the
     action buttons; it takes the leftover width and stays left-aligned. */
  .note {
    grid-area: note;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 13px;
  }

  .when {
    grid-area: when;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    font-size: 13px;
  }

  .when .muted {
    color: var(--muted);
  }

  .when .next {
    font-weight: 600;
    font-size: 14px;
  }

  .when .rel {
    color: var(--muted);
  }

  .actions {
    grid-area: actions;
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    align-self: end;
  }

  /* Lucide icons draw their own SVG: no font-dependent ink centering to
     correct, the fixed square just centers the graphic. */
</style>
