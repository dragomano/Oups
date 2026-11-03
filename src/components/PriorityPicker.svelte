<script lang="ts">
  import { tick } from "svelte";
  import type { Priority } from "../lib/api";
  import { t } from "../lib/i18n.svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import { floatingPanel } from "../lib/floating-panel";

  let { priority = $bindable("normal") }: { priority?: Priority } = $props();

  const LEVELS: { id: Priority; important: boolean }[] = [
    { id: "low", important: false },
    { id: "normal", important: false },
    { id: "high", important: true },
    { id: "critical", important: true },
  ];

  const current = $derived(LEVELS.find((l) => l.id === priority) ?? LEVELS[1]);

  let root = $state<HTMLDivElement | null>(null);
  let toggle = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLDivElement | null>(null);
  let open = $state(false);
  /** Highlighted option while the list is open, driven by the arrow keys. */
  let cursor = $state(0);
  // The menu is position:fixed and measured from the button, so it escapes the
  // dialog's scroll container instead of being clipped by it.
  let pos = $state({ top: 0, left: 0, width: 0, maxHeight: 260 });

  function place() {
    if (!toggle) return;

    const r = toggle.getBoundingClientRect();
    const h = menu?.offsetHeight ?? 0;
    const fitted = floatingPanel(r, h, window.innerWidth, window.innerHeight);
    pos = { ...fitted, maxHeight: Math.min(260, fitted.maxHeight) };
  }

  async function show() {
    cursor = Math.max(0, LEVELS.findIndex((l) => l.id === priority));
    open = true;
    await tick();
    place();
  }

  function hide() {
    open = false;
  }

  async function toggleOpen() {
    if (open) hide();
    else await show();
  }

  function choose(id: Priority) {
    priority = id;
    hide();
    toggle?.focus();
  }

  function move(step: number) {
    cursor = (cursor + step + LEVELS.length) % LEVELS.length;
    tick().then(() => {
      place();
      menu?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      cursor = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      cursor = LEVELS.length - 1;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(LEVELS[cursor].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide();
      toggle?.focus();
    } else if (e.key === "Tab") {
      hide();
    }
  }

  // Clicking anywhere else closes the list; Escape is handled above so it only
  // closes the picker instead of the whole editor dialog.
  $effect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!root?.contains(e.target as Node)) hide();
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  });
</script>

<div class="picker" bind:this={root}>
  <button
    type="button"
    class="picker-btn"
    bind:this={toggle}
    aria-label={t("editor.priority_label")}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={toggleOpen}
    onkeydown={onKeydown}
  >
    <span class="prio-icon prio-{current.id}">
      {#if current.id === "critical"}
        <ChevronsUp size={18} strokeWidth={2.5} />
      {:else if current.id === "high"}
        <ChevronUp size={18} strokeWidth={2.5} />
      {:else if current.id === "normal"}
        <Circle size={16} />
      {:else}
        <ChevronDownIcon size={18} strokeWidth={2.5} />
      {/if}
    </span>
    <span class="txt">
      {t(`priority.${current.id}`)}
      <span class="sub">{t(`priority.${current.id}_desc`)}</span>
    </span>
    <span class="chev" class:up={open}><ChevronDown size={14} /></span>
  </button>

  {#if open}
    <div
      class="picker-menu"
      role="listbox"
      aria-label={t("editor.priority_label")}
      bind:this={menu}
      style="top: {pos.top}px; left: {pos.left}px; width: {pos.width}px; max-height: {pos.maxHeight}px;"
    >
      {#each LEVELS as level, i (level.id)}
        <button
          type="button"
          role="option"
          data-index={i}
          aria-label={t(`priority.${level.id}`)}
          aria-selected={priority === level.id}
          class:hot={i === cursor}
          onclick={() => choose(level.id)}
          onmouseenter={() => (cursor = i)}
        >
          <span class="prio-icon prio-{level.id}">
            {#if level.id === "critical"}
              <ChevronsUp size={18} strokeWidth={2.5} />
            {:else if level.id === "high"}
              <ChevronUp size={18} strokeWidth={2.5} />
            {:else if level.id === "normal"}
              <Circle size={16} />
            {:else}
              <ChevronDownIcon size={18} strokeWidth={2.5} />
            {/if}
          </span>
          <span class="body">
            <span class="name">
              {t(`priority.${level.id}`)}
              <span class="quad-hint">
                {t(level.important ? "priority.important" : "priority.not_important")}
              </span>
            </span>
            <span class="desc">{t(`priority.${level.id}_desc`)}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }

  .picker-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 7px 11px;
  }

  .picker-btn .txt {
    flex: 1;
    min-width: 0;
  }

  .picker-btn .sub {
    display: block;
    color: var(--muted);
    font-size: 12px;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-btn .chev {
    color: var(--muted);
    display: inline-flex;
    transition: transform 0.15s;
  }

  .picker-btn .chev.up {
    transform: rotate(180deg);
  }

  /* Fixed positioning: the editor dialog scrolls, and a list anchored inside
     it would be clipped at the padding box. */
  .picker-menu {
    position: fixed;
    z-index: 60;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 4px;
    max-height: 260px;
    overflow-y: auto;
  }

  .picker-menu button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    border: none;
    background: transparent;
    padding: 7px 9px;
    border-radius: 7px;
  }

  .picker-menu button.hot {
    background: var(--panel-2);
  }

  .picker-menu button[aria-selected="true"] {
    background: var(--accent-soft);
  }

  .picker-menu button[aria-selected="true"].hot {
    background: var(--accent-soft);
  }

  .picker-menu .body {
    min-width: 0;
  }

  .picker-menu .name {
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .picker-menu .desc {
    display: block;
    color: var(--muted);
    font-size: 12px;
    margin-top: 1px;
  }

  .quad-hint {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    padding: 1px 6px;
    border-radius: 20px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
</style>
