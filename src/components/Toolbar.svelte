<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { SEARCH_MIN_WIDTH, chooseToolbarLayout } from "../lib/toolbar-layout";
  import type { View } from "../lib/api";
  import { t } from "../lib/i18n.svelte";
  import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
  import ArrowUpFromLine from "@lucide/svelte/icons/arrow-up-from-line";
  import Plus from "@lucide/svelte/icons/plus";
  import Settings from "@lucide/svelte/icons/settings";

  let {
    query = $bindable(""),
    onNew,
    onSettings,
    onImport,
    onExport,
  }: {
    query?: string;
    onNew: () => void;
    onSettings: () => void;
    onImport: () => void;
    onExport: () => void;
  } = $props();

  let bar: HTMLElement;
  let probe: HTMLElement;
  let layout = $state({ ioLabels: true, newLabel: true, searchOwnRow: false });

  function measure() {
    if (!bar || !probe) return;
    const width = (selector: string) => probe.querySelector(selector)!.getBoundingClientRect().width;
    const style = getComputedStyle(bar);
    const gap = parseFloat(style.columnGap);
    layout = chooseToolbarLayout({
      available: bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1,
      gap,
      search: SEARCH_MIN_WIDTH,
      newWithLabel: width('.new-btn'),
      newIcon: 30,
      ioWithLabels: width('.io-group'),
      ioIcons: 60 + gap,
      settings: width('.icon-settings'),
    });
  }

  onMount(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(probe);
    document.fonts.ready.then(measure);
    measure();
    return () => observer.disconnect();
  });

  $effect(() => {
    t('toolbar.new');
    t('toolbar.import');
    t('toolbar.export');
    tick().then(measure);
  });
</script>

<!-- The app's actions. The view tabs and the window's caption buttons live in
     the title strip above, so this row holds only what the app does. -->
{#snippet controls()}
  <button class="primary new-btn" onclick={onNew} title={t("toolbar.new")} aria-label={t("toolbar.new")}>
    <Plus size={16} /><span class="label">{t("toolbar.new")}</span>
  </button>

  <input
    class="search"
    type="search"
    placeholder={t("toolbar.search")}
    aria-label={t("toolbar.search")}
    bind:value={query}
  />

  <div class="io-group">
    <button class="io" onclick={onImport} title={t("toolbar.import")} aria-label={t("toolbar.import")}>
      <ArrowDownToLine size={16} />
      <span class="label">{t("toolbar.import")}</span>
    </button>
    <button class="io" onclick={onExport} title={t("toolbar.export")} aria-label={t("toolbar.export")}>
      <ArrowUpFromLine size={16} />
      <span class="label">{t("toolbar.export")}</span>
    </button>
  </div>

  <button class="icon icon-settings" onclick={onSettings} title={t("toolbar.settings")} aria-label={t("toolbar.settings")}><Settings size={16} /></button>
{/snippet}

<header class="toolbar" class:search-below={layout.searchOwnRow}
  class:hide-new={!layout.newLabel} class:hide-io={!layout.ioLabels} bind:this={bar}>
  {@render controls()}
</header>
<div class="probe" bind:this={probe} inert aria-hidden="true">
  {@render controls()}
</div>

<style>
  .toolbar {
    display: grid;
    grid-template-columns: max-content minmax(170px, 1fr) max-content max-content;
    grid-template-areas: "new search io settings";
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--toolbar-bg);
    border-bottom: 1px solid var(--border);
  }

  /* The search moves to a row of its own; the button row keeps its places. */
  .search-below {
    grid-template-columns: max-content minmax(0, 1fr) max-content max-content;
    grid-template-areas:
      "new . io settings"
      "search search search search";
  }

  .probe {
    position: fixed;
    top: 0;
    left: -100000px;
    display: flex;
    width: max-content;
    gap: 10px;
    visibility: hidden;
    pointer-events: none;
  }

  .new-btn, .io {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .new-btn :global(svg), .io :global(svg) { flex: none; }

  .new-btn { grid-area: new; }
  .search { grid-area: search; width: 100%; min-width: 170px; }
  .io-group { grid-area: io; display: inline-flex; gap: 10px; }
  .icon-settings { grid-area: settings; color: inherit; }
  .search-below .search { min-width: 0; }
  .hide-new .new-btn, .hide-io .io {
    justify-content: center;
    inline-size: 30px;
    block-size: 30px;
    padding: 0;
    line-height: 1;
  }
  .hide-new .new-btn .label, .hide-io .io .label { display: none; }
</style>
