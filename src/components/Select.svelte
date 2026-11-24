<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { tick } from "svelte";
  import { floatingPanel } from "../lib/floating-panel";

  type Option = { value: string; label: string };

  let {
    options = [],
    value = $bindable(""),
    ariaLabel = "",
    onchange,
  }: {
    options?: Option[];
    value?: string;
    ariaLabel?: string;
    onchange?: (value: string) => void;
  } = $props();

  const MENU_MAX = 288;

  let open = $state(false);
  let cursor = $state(0);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLElement>();

  // The menu is position: fixed and measured from the trigger, so the editor's
  // scroll container cannot clip it.
  let pos = $state({ top: 0, left: 0, width: 0, maxHeight: MENU_MAX });

  const current = $derived(options.find((option) => option.value === value) ?? { value, label: value });

  function place() {
    if (!trigger) return;

    const fitted = floatingPanel(
      trigger.getBoundingClientRect(),
      menu?.offsetHeight ?? 0,
      window.innerWidth,
      window.innerHeight,
    );

    pos = { ...fitted, maxHeight: Math.min(MENU_MAX, fitted.maxHeight) };
  }

  function revealCursor() {
    menu?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }

  async function show() {
    cursor = Math.max(0, options.findIndex((option) => option.value === value));
    open = true;
    await tick();
    place();
    revealCursor();
  }

  function close() {
    open = false;
    trigger?.focus();
  }

  function choose(next: string) {
    value = next;
    onchange?.(next);
    close();
  }

  function toggle() {
    if (open) open = false;
    else void show();
  }

  function onkeydown(event: KeyboardEvent) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void show();
      }

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      cursor = Math.min(cursor + 1, options.length - 1);
      revealCursor();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      revealCursor();
    } else if (event.key === "Home") {
      event.preventDefault();
      cursor = 0;
      revealCursor();
    } else if (event.key === "End") {
      event.preventDefault();
      cursor = options.length - 1;
      revealCursor();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      const option = options[cursor];

      if (option) choose(option.value);
    } else if (event.key === "Escape") {
      // Only the list closes: the editor and the popup also listen for Escape.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      open = false;
    }
  }

  $effect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) open = false;
    };
    const onScroll = (event: Event) => {
      // A scroll inside the open menu itself (the month list is taller than its
      // panel) must not close the menu; only scrolling the page/editor should.
      const target = event.target;

      if (target instanceof Node && root?.contains(target)) return;

      open = false;
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  });
</script>

<div class="select" bind:this={root}>
  <button
    type="button"
    class="select-trigger"
    bind:this={trigger}
    aria-label={ariaLabel}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={toggle}
    onkeydown={onkeydown}
  >
    <span class="select-value">{current.label}</span>
    <span class="select-chevron" class:open={open}>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  </button>

  {#if open}
    <div
      class="select-menu"
      role="listbox"
      aria-label={ariaLabel}
      bind:this={menu}
      style:top={`${pos.top}px`}
      style:left={`${pos.left}px`}
      style:width={`${pos.width}px`}
      style:max-height={`${pos.maxHeight}px`}
    >
      {#each options as option, index (option.value)}
        <button
          type="button"
          role="option"
          data-index={index}
          class="select-option"
          class:active={index === cursor}
          aria-selected={option.value === value}
          onclick={() => choose(option.value)}
          onmouseenter={() => (cursor = index)}
        >
          <span>{option.label}</span>
          {#if option.value === value}<span class="select-check" aria-hidden="true">✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .select {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .select-trigger {
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

  .select-trigger:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  .select-trigger:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
    outline: none;
  }

  .select-trigger :global(svg) {
    flex: none;
    color: var(--muted);
  }

  .select-chevron {
    display: inline-flex;
    flex: none;
    color: var(--muted);
    transition: transform 0.15s ease;
  }

  .select-chevron.open {
    transform: rotate(180deg);
  }

  .select-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The compact panel of a list menu: 4px inset, at most 18rem tall. */
  .select-menu {
    position: fixed;
    z-index: 80;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  /* The highlighted row is the primary surface, the selected row carries the
     checkmark. */
  .select-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 9px 12px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    text-align: start;
    cursor: pointer;
  }

  .select-option.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .select-option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .select-check {
    flex: none;
    color: var(--accent);
    font-weight: 700;
  }

  /* The highlighted and selected rows are accent-tinted in both themes; their
     text and check need full contrast on a dark panel. */
  :global(:root[data-theme="dark"]) .select-option.active,
  :global(:root[data-theme="dark"]) .select-option[aria-selected="true"],
  :global(:root[data-theme="dark"]) .select-check {
    color: var(--accent-text);
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) .select-option.active,
    :global(:root:not([data-theme="light"])) .select-option[aria-selected="true"],
    :global(:root:not([data-theme="light"])) .select-check {
      color: var(--accent-text);
    }
  }
</style>
