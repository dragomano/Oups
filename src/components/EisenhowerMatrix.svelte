<script lang="ts">
  import type { Reminder } from "../lib/api";
  import { api } from "../lib/api";
  import { clock } from "../lib/clock.svelte";
  import { t } from "../lib/i18n.svelte";
  import Compass from "@lucide/svelte/icons/compass";
  import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Flame from "@lucide/svelte/icons/flame";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import CalendarClock from "@lucide/svelte/icons/calendar-clock";
  import Coffee from "@lucide/svelte/icons/coffee";
  import {
  QUADRANTS,
  dueKind,
  groupByQuadrant,
  priorityForQuadrant,
  type Quadrant,
} from "../lib/matrix";
  import { fmtDate, fmtTime, parseLocal } from "../lib/time";

  let {
    reminders,
    loading,
    onEdit,
  }: {
    reminders: Reminder[];
    loading: boolean;
    onEdit: (r: Reminder) => void;
  } = $props();

  const META: Record<Quadrant, { title: string; icon: typeof Flame; cls: string }> = {
    do: { title: "matrix.do", icon: Flame, cls: "q-do" },
    delegate: { title: "matrix.delegate", icon: Hourglass, cls: "q-delegate" },
    schedule: { title: "matrix.schedule", icon: CalendarClock, cls: "q-schedule" },
    drop: { title: "matrix.drop", icon: Coffee, cls: "q-drop" },
  };

  // Driven by the shared clock, so overdue items move between the quadrants as
  // their moment approaches — not only when the reminder list itself changes.
  const now = $derived(clock.now);
  const groups = $derived(groupByQuadrant(reminders, now));
  const total = $derived(reminders.length);

  let draggedReminder = $state<Reminder | null>(null);
  let dragOverQuadrant = $state<Quadrant | null>(null);

  /** Overdue reads as a word, today as a clock time, the rest as a date. */
  function dueText(r: Reminder): { text: string; overdue: boolean } {
    const d = parseLocal(r.nextDue);

    if (!d) return { text: "", overdue: false };

    const kind = dueKind(r.nextDue, now);

    if (kind === "overdue") return { text: t("matrix.overdue"), overdue: true };
    if (kind === "soon") return { text: fmtTime(d), overdue: false };

    return { text: fmtDate(d), overdue: false };
  }

  /**
   * Dragging is a shortcut for changing importance: the quadrant the card
   * lands in names the priority it gets. The schedule is never touched.
   */
  async function handleDrop(e: DragEvent, targetQuadrant: Quadrant) {
    e.preventDefault();
    e.stopPropagation();

    const r = draggedReminder;

    draggedReminder = null;
    dragOverQuadrant = null;

    if (!r || r.priority === priorityForQuadrant(targetQuadrant)) return;

    await api.upsertReminder({ ...r, priority: priorityForQuadrant(targetQuadrant) });
  }

  function handleDragStart(e: DragEvent, r: Reminder) {
    draggedReminder = r;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", r.id);
    }
  }

  function handleDragEnd() {
    draggedReminder = null;
    dragOverQuadrant = null;
  }

  function handleDragOver(e: DragEvent, q: Quadrant) {
    if (!draggedReminder) return;

    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    dragOverQuadrant = q;
  }

  function handleDragLeave(e: DragEvent) {
    // Only clear if leaving the section itself, not child elements
    if (e.currentTarget === e.target) {
      dragOverQuadrant = null;
    }
  }
</script>

{#if loading}
  <div class="placeholder">…</div>
{:else if total === 0}
  <div class="placeholder" role="status">
    <div class="big"><Compass size={40} strokeWidth={1.5} aria-hidden="true" /></div>
    <div class="title">{t("list.empty_title")}</div>
    <div class="hint">{t("list.empty_hint")}</div>
  </div>
{:else}
  <div class="matrix">
    {#each QUADRANTS as q (q)}
        {@const meta = META[q]}
        {@const Icon = meta.icon}
        {@const items = groups[q]}
        <section
          class="quad {meta.cls}"
          class:drag-over={dragOverQuadrant === q}
          aria-label={t(meta.title)}
          ondragover={(e) => handleDragOver(e, q)}
          ondragleave={(e) => handleDragLeave(e)}
          ondrop={(e) => handleDrop(e, q)}
        >
          <header>
            <span class="q-title">
              <span class="q-icon" aria-hidden="true"><Icon size={15} /></span>{t(meta.title)}
            </span>
            <span class="q-count">{items.length}</span>
          </header>
          {#if items.length === 0}
            <div class="q-empty">{t("matrix.empty")}</div>
          {:else}
            <ul class="q-list">
              {#each items as r (r.id)}
                {@const due = dueText(r)}
                <li
                  class="q-item"
                  class:dragging={draggedReminder?.id === r.id}
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, r)}
                  ondragend={handleDragEnd}
                >
                  <button
                    class="q-item-btn"
                    aria-label={due.text ? `${r.title} — ${due.text}` : r.title}
                    onclick={() => onEdit(r)}
                  >
                    <span class="prio-icon prio-{r.priority}" title={t(`priority.${r.priority}`)}>
                      {#if r.priority === "critical"}
                        <ChevronsUp size={16} strokeWidth={2.5} />
                      {:else if r.priority === "high"}
                        <ChevronUp size={16} strokeWidth={2.5} />
                      {:else if r.priority === "normal"}
                        <Circle size={14} />
                      {:else}
                        <ChevronDown size={16} strokeWidth={2.5} />
                      {/if}
                    </span>
                    <span class="qt">{r.title}</span>
                    {#if due.text}
                      <span class="qtime" class:overdue={due.overdue}>{due.text}</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
  </div>
{/if}

<style>
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 80px 20px;
    color: var(--muted);
    text-align: center;
  }

  .placeholder .big {
    color: var(--muted);
    line-height: 1;
  }

  .placeholder .title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
  }

  .matrix {
    height: 100%;
    min-height: 460px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 8px;
  }

  .quad {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    transition: background-color 0.15s ease;
  }

  .quad.drag-over {
    background: var(--panel-2);
    border-color: var(--accent);
  }

  .quad > header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }

  .q-title {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Inline wrapper: the flex row centers the box, the SVG never rides the
     text baseline (the way the toolbar arrows did before the flex fix). */
  .q-icon {
    display: inline-flex;
    flex: none;
  }

  /* Each header icon carries the color of its block's left stripe. "Drop"
     is the exception: its stripe is --border, which would be near invisible
     on the header panel, so it gets the neutral readable gray. */
  .q-do .q-icon {
    color: var(--danger);
  }

  .q-delegate .q-icon {
    color: var(--warn);
  }

  .q-schedule .q-icon {
    color: var(--accent);
  }

  .q-drop .q-icon {
    color: var(--muted);
  }

  .q-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    background: var(--panel-2);
    border-radius: 20px;
    padding: 1px 8px;
    margin-left: auto;
    flex: none;
  }

  .q-list {
    list-style: none;
    margin: 0;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .q-item {
    cursor: grab;
    border-radius: calc(var(--radius) - 2px);
    transition: opacity 0.2s ease;
  }

  .q-item:active {
    cursor: grabbing;
  }

  .q-item.dragging {
    opacity: 0.5;
  }

  .q-item-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 7px 9px;
    pointer-events: auto;
  }

  .qt {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .qtime {
    font-size: 12px;
    color: var(--muted);
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  .qtime.overdue {
    color: var(--danger);
    font-weight: 600;
  }

  .q-empty {
    color: var(--muted);
    font-size: 12px;
    padding: 12px;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .q-do {
    border-left: 3px solid var(--danger);
  }

  .q-do > header {
    background: var(--danger-soft);
  }

  .q-delegate {
    border-left: 3px solid var(--warn);
  }

  .q-delegate > header {
    background: var(--warn-soft);
  }

  .q-schedule {
    border-left: 3px solid var(--accent);
  }

  .q-schedule > header {
    background: var(--accent-soft);
  }

  .q-drop {
    border-left: 3px solid var(--border);
  }

  .q-drop > header {
    background: var(--panel-2);
  }

  @media (max-width: 720px) {
    .matrix {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(4, minmax(150px, 1fr));
    }
  }
</style>