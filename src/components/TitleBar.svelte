<script lang="ts">
  import type { Snippet } from "svelte";
  import type { View } from "../lib/api";
  import { nextRadioIndex } from "../lib/radio-group";
  import { localeDir, t } from "../lib/i18n.svelte";
  import icon from "../../src-tauri/icons/32x32.png";

  let {
    name,
    view = $bindable<View>("active"),
    windowControls,
    viewId,
  }: {
    /** The app's display name, straight from productName (not translatable). */
    name: string;
    view?: View;
    /** The window's caption buttons, rendered in the strip's last cell. */
    windowControls?: Snippet;
    viewId: string;
  } = $props();

  const views = [
    { id: 'active', label: 'toolbar.active' },
    { id: 'done', label: 'toolbar.done' },
    { id: 'matrix', label: 'toolbar.matrix' },
  ] as const;
  function moveTab(event: KeyboardEvent, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
    const rtl = localeDir() === "rtl";
    const direction = rtl && key === "ArrowLeft" ? "ArrowRight" : rtl && key === "ArrowRight" ? "ArrowLeft" : key;
    const next = nextRadioIndex(direction, index, views.length);
    if (next === null) return;
    event.preventDefault();
    view = views[next].id;
    document.getElementById(`${viewId}-tab-${view}`)?.focus();
  }
</script>

<!-- The window's title strip, inside the card: the brand on the left, the view
     tabs in the middle, the caption buttons on the right. The tabs live here
     rather than in the toolbar, so the toolbar keeps only the app's actions
     and the strip reads like a native title bar. -->
<header class="titlebar">
  <div class="brand">
    <img src={icon} alt="" />
    <span>{name}</span>
  </div>

  <div class="slot">
    <div class="seg" role="tablist" aria-label={t("a11y.views")}>
      {#each views as v, index (v.id)}
        <button
          class="seg-btn"
          type="button"
          role="tab"
          id={`${viewId}-tab-${v.id}`}
          aria-controls={`${viewId}-panel-${v.id}`}
          tabindex={view === v.id ? 0 : -1}
          onkeydown={(event) => moveTab(event, index)}
          aria-selected={view === v.id}
          class:active={view === v.id}
          onclick={() => (view = v.id)}
        >
          {t(v.label)}
        </button>
      {/each}
    </div>
  </div>

  <div class="slot">
    {@render windowControls?.()}
  </div>
</header>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding-inline: 13px 6px;
    border-bottom: 1px solid var(--border);
    background: var(--titlebar-bg);
  }

  .brand {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
  }

  .brand img {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }

  /* Both slots take the free space, so the tabs land in the middle and the
     caption buttons stay against the right edge. */
  .slot {
    display: flex;
    margin-inline-start: auto;
  }

  .seg {
    display: inline-flex;
    flex: none;
    width: max-content;
    margin-inline-start: 4px;
    padding: 2px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .seg-btn {
    border: none;
    background: transparent;
    padding: 5px 12px;
    border-radius: 6px;
    color: var(--muted);
  }

  .seg-btn.active {
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 1px 2px var(--overlay-soft);
  }
</style>
