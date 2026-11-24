<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { type Snippet, tick } from "svelte";
  import { floatingPanel } from "../lib/floating-panel";

  type Option = { value: string; label: string; description?: string; lang?: string };

  let {
    options = [],
    value = $bindable(""),
    ariaLabel,
    onchange,
    presentation = "default",
    content,
  }: {
    options?: Option[];
    value?: string;
    ariaLabel: string;
    onchange?: (value: string) => void;
    presentation?: "default" | "priority";
    content?: Snippet<[Option, boolean]>;
  } = $props();

  const id = $props.id();
  const menuMax = $derived(presentation === "priority" ? 260 : 288);
  const optionId = (index: number) => `${id}-option-${index}`;

  let open = $state(false);
  let cursor = $state(0);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLElement>();

  // The menu is position: fixed and measured from the trigger, so the editor's
  // scroll container cannot clip it.
  let pos = $state({ top: 0, left: 0, width: 0, maxHeight: 288 });

  const current = $derived(options.find((option) => option.value === value) ?? { value, label: value });

  function place() {
    if (!trigger) return;

    const fitted = floatingPanel(
      trigger.getBoundingClientRect(),
      menu?.scrollHeight ?? 0,
      window.innerWidth,
      window.innerHeight,
    );

    pos = { ...fitted, maxHeight: Math.min(menuMax, fitted.maxHeight) };
  }

  function revealCursor() {
    menu?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }

  async function show() {
    if (!options.length) return;
    trigger?.focus({ preventScroll: true });
    cursor = Math.max(0, options.findIndex((option) => option.value === value));
    open = true;
    await tick();
    place();
    await tick();
    revealCursor();
  }

  function close() {
    open = false;
    trigger?.focus({ preventScroll: true });
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
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;

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
      const option = options[cursor];
      if (option) choose(option.value);
    }
  }

  $effect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });
</script>

<div class="select" class:priority={presentation === "priority"} bind:this={root}>
  <button
    type="button"
    class="select-trigger"
    class:picker-btn={presentation === "priority"}
    role="combobox"
    disabled={!options.length}
    bind:this={trigger}
    aria-label={ariaLabel}
    aria-controls={open ? id : undefined}
    aria-activedescendant={open && options[cursor] ? optionId(cursor) : undefined}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={toggle}
    onblur={() => (open = false)}
    onkeydown={onkeydown}
  >
    {#if content}
      <span class="sr-only" lang={current.lang}>{current.label}</span>
      {@render content(current, false)}
    {:else}
      <span class="select-value" lang={current.lang}>{current.label}</span>
    {/if}
    <span class="select-chevron" class:open={open}>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  </button>

  {#if open}
    <div
      {id}
      class="select-menu"
      class:picker-menu={presentation === "priority"}
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
          id={optionId(index)}
          data-index={index}
          tabindex="-1"
          lang={option.lang}
          aria-label={option.label}
          aria-describedby={option.description ? `${optionId(index)}-description` : undefined}
          class="select-option"
          class:active={index === cursor}
          aria-selected={option.value === value}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => choose(option.value)}
          onmouseenter={() => (cursor = index)}
        >
          {#if content}
            {@render content(option, true)}
            {#if option.description}
              <span class="sr-only" id={`${optionId(index)}-description`}>{option.description}</span>
            {/if}
          {:else}
            <span>{option.label}</span>
          {/if}
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
    color: var(--text);
  }

  .priority .select-trigger { justify-content: flex-start; gap: 10px; padding: 7px 11px; }
  .priority .select-menu { border-radius: 10px; }
  .priority .select-option { justify-content: flex-start; gap: 10px; padding: 7px 9px; border-radius: 7px; }
  .priority .select-option.active { background: var(--panel-2); }
  .priority .select-option[aria-selected="true"] { background: var(--accent-soft); }
  .select-option.active {
    outline: 1px solid var(--text);
    outline-offset: -2px;
  }
  .priority .select-check { margin-inline-start: auto; }

  .select-check {
    flex: none;
    color: var(--accent);
    font-weight: 700;
  }

  /* The highlighted and selected rows are accent-tinted in both themes; their
     text and check need full contrast on a dark panel. */
  :global(:root[data-theme="dark"]) .select-check {
    color: var(--accent-text);
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) .select-check {
      color: var(--accent-text);
    }
  }
</style>
