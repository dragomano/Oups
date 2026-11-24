<script lang="ts">
  import { onMount } from "svelte";
  import { api, type LocaleInfo } from "../lib/api";
  import { t, loadLocale } from "../lib/i18n.svelte";
  import { radioGroup } from "../lib/radio-group";
  import { ACCENTS, applyTheme } from "../lib/theme";
  import Select from "./Select.svelte";
  import PopupCornerPicker from "./PopupCornerPicker.svelte";
  import Bell from "@lucide/svelte/icons/bell";
  import Check from "@lucide/svelte/icons/check";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Moon from "@lucide/svelte/icons/moon";
  import Palette from "@lucide/svelte/icons/palette";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Sun from "@lucide/svelte/icons/sun";
  import X from "@lucide/svelte/icons/x";

  let { onClose }: { onClose: () => void } = $props();
  const ids = $props.id();

  let language = $state("en");
  let closeToTray = $state(true);
  let autostart = $state(false);
  let theme = $state("system");
  let accent = $state("blue");
  let popupCorner = $state("bottom-right");
  let loaded = $state(false);
  let locales = $state<LocaleInfo[]>([]);
  let appliedLanguage = "";

  // Same systematic palette as app.css: OKLCH L 0.55 / C 0.155, hue step 40°.
  const ACCENT_COLORS: Record<string, string> = {
    red: "oklch(0.55 0.155 10)", orange: "oklch(0.55 0.155 50)",
    amber: "oklch(0.55 0.155 90)", green: "oklch(0.55 0.155 130)",
    teal: "oklch(0.55 0.155 170)", cyan: "oklch(0.55 0.155 210)",
    blue: "oklch(0.55 0.155 250)", violet: "oklch(0.55 0.155 290)",
    pink: "oklch(0.55 0.155 330)",
  };
  const THEMES = [
    { mode: "system", icon: Monitor }, { mode: "dark", icon: Moon }, { mode: "light", icon: Sun },
  ];

  onMount(async () => {
    try {
      const s = await api.getSettings();
      language = s.language;
      appliedLanguage = language;
      closeToTray = s.closeToTray;
      autostart = s.autostartEnabled;
      theme = s.theme;
      accent = s.accent;
      popupCorner = s.popupCorner;
      locales = await api.listLocales();
    } finally {
      loaded = true;
    }
  });

  async function toggleAutostart(event: Event) {
    autostart = await api.setAutostart((event.currentTarget as HTMLInputElement).checked);
  }

  // Save on change; closing the dialog needs no save step.
  async function persist() {
    try {
      await api.setSettings({ language, closeToTray, theme, accent, popupCorner });
      if (language !== appliedLanguage) {
        appliedLanguage = language;
        await loadLocale(language);
      }
    } catch (e) {
      console.error("failed to save settings", e);
    }
  }

  function pickTheme(mode: string) {
    theme = mode;
    applyTheme(theme, accent);
    void persist();
  }

  function pickAccent(next: string) {
    accent = next;
    applyTheme(theme, accent);
    void persist();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !event.defaultPrevented) onClose();
  }
</script>

  <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`}>
    <header class="settings-head" data-tauri-drag-region>
      <h2 id={`${ids}-title`} data-tauri-drag-region>{t("settings.title")}</h2>
      <button class="icon close" type="button" onclick={onClose} aria-label={t("settings.close")}>
        <X size={16} aria-hidden="true" />
      </button>
    </header>

    <div class="settings-body" aria-busy={!loaded}>
      <div class="settings-grid">
      {#if loaded}
        <section class="settings-group">
          <h3><Palette size={16} aria-hidden="true" />{t("settings.group_appearance")}</h3>
          <label class="settings-field">
            <span>{t("settings.language")}</span>
            <Select
              value={language}
              onchange={(next) => { language = next; void persist(); }}
              options={locales.map((locale) => ({ value: locale.code, label: locale.name }))}
              ariaLabel={t("settings.language")}
            />
          </label>
          <div class="settings-field settings-theme-field">
            <span>{t("settings.theme")}</span>
            <div class="settings-themes" role="group" aria-label={t("settings.theme")}>
              {#each THEMES as item (item.mode)}
                <button type="button" aria-label={t(`theme.${item.mode}`)} title={t(`theme.${item.mode}`)} aria-pressed={theme === item.mode} onclick={() => pickTheme(item.mode)}>
                  <item.icon size={16} aria-hidden="true" /><span>{t(`theme.${item.mode}`)}</span>
                </button>
              {/each}
            </div>
          </div>
          <div class="settings-field">
            <span>{t("settings.accent")}</span>
            <div class="settings-swatches" role="radiogroup" aria-label={t("settings.accent")} use:radioGroup>
              {#each ACCENTS as color (color)}
                <button type="button" class="settings-swatch" style:--swatch={ACCENT_COLORS[color]}
                  title={t(`accent.${color}`)} aria-label={t(`accent.${color}`)} role="radio"
                  aria-checked={accent === color} tabindex={accent === color ? 0 : -1} onclick={() => pickAccent(color)}>
                  {#if accent === color}<Check size={16} strokeWidth={2.5} aria-hidden="true" />{/if}
                </button>
              {/each}
            </div>
          </div>
        </section>

        <section class="settings-group">
          <h3><Bell size={16} aria-hidden="true" />{t("settings.group_notifications")}</h3>
          <PopupCornerPicker
            value={popupCorner}
            onchange={(corner) => { popupCorner = corner; void persist(); }}
          />
        </section>

        <section class="settings-group settings-behavior">
          <h3><SlidersHorizontal size={16} aria-hidden="true" />{t("settings.group_behavior")}</h3>
          <div class="settings-checks">
            <label class="settings-check">
              <span>{t("settings.close_to_tray")}</span>
              <input class="switch" type="checkbox" role="switch" checked={closeToTray}
                onchange={(event) => { closeToTray = event.currentTarget.checked; void persist(); }} />
            </label>
            <label class="settings-check">
              <span>{t("settings.autostart")}</span>
              <input class="switch" type="checkbox" role="switch" checked={autostart} onchange={toggleAutostart} />
            </label>
          </div>
        </section>
      {/if}
      </div>
    </div>
    <footer class="settings-footer"><Check size={14} aria-hidden="true" /><span>{t("settings.applied_immediately")}</span></footer>
  </div>

<svelte:window onkeydown={onKeydown} />

<style>
  .settings-dialog {
    width: 100%;
    height: 100dvh;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    overflow: hidden;
  }

  .settings-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px 0;
    flex: none;
  }

  .settings-head h2 { margin: 0; font-size: 20px; }

  .settings-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 14px;
    padding: 18px 22px 20px;
  }

  .settings-group {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 11px;
    padding: 14px 15px;
    background: color-mix(in srgb, var(--panel-2) 45%, var(--panel));
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .settings-group h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 650;
  }

  .settings-group h3 :global(svg) { flex: none; color: var(--accent); }
  .settings-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .settings-field > span { color: var(--muted); font-size: 13px; }
  .settings-field > :global(.select) { width: 100%; }
  .settings-theme-field { container: settings-theme / inline-size; }

  .settings-themes {
    display: flex;
    min-width: 0;
    padding: 3px;
    gap: 3px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--panel-2);
  }

  .settings-themes button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 7px 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
  }

  .settings-themes :global(svg) { flex: none; }
  .settings-themes button[aria-pressed="true"] { background: var(--panel); color: var(--text); }

  @container settings-theme (max-width: 350px) {
    .settings-themes button span { display: none; }
  }

  .settings-swatches {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    align-items: center;
    justify-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 3px 2px;
  }

  .settings-swatch {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 28px;
    aspect-ratio: 1;
    min-width: 0;
    border: 2px solid var(--border);
    border-radius: 50%;
    padding: 0;
    background: var(--swatch);
    color: var(--accent-text);
  }

  .settings-swatch[aria-checked="true"] {
    outline: 2px solid var(--text);
    outline-offset: 3px;
  }

  .settings-behavior { grid-column: 1 / -1; gap: 12px; }
  .settings-checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
  .settings-check { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 38px; font-size: 14px; cursor: pointer; }
  .settings-check > span { min-width: 0; }
  .settings-check .switch { margin: 0; }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex: none;
    margin: 0 22px;
    padding: 16px 0 18px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
  }

  .settings-footer :global(svg) { flex: none; }
  .settings-dialog button:focus-visible,
  .settings-check .switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  @media (min-width: 561px) and (max-height: 640px) {
    .settings-head { padding-top: 16px; }
    .settings-grid { padding-block: 14px; gap: 12px; }
    .settings-group { gap: 14px; }
    .settings-behavior { gap: 10px; }
  }

  @media (max-width: 560px) {
    .settings-head { padding: 16px 16px 0; }
    .settings-head .icon { inline-size: 44px; block-size: 44px; }
    .settings-grid { grid-template-columns: minmax(0, 1fr); padding: 14px 16px 16px; }
    .settings-behavior { grid-column: auto; }
    .settings-checks { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .settings-check { min-height: 44px; }
    .settings-themes button { min-height: 44px; }
    .settings-field > :global(.select) > :global(.select-trigger) { font-size: 16px; min-height: 44px; }
    .settings-swatches { grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); gap: 4px; padding: 0; }
    .settings-swatch { position: relative; width: 44px; max-width: 44px; height: 44px; border: none; background: transparent; }
    .settings-swatch::before { content: ""; position: absolute; inset: 6px; border-radius: 50%; background: var(--swatch); border: 2px solid var(--border); }
    .settings-swatch :global(svg) { z-index: 1; }
    .settings-swatch[aria-checked="true"] { outline: none; }
    .settings-swatch[aria-checked="true"]::before { outline: 2px solid var(--text); outline-offset: 3px; }
    .settings-footer { margin-inline: 16px; padding-block: 14px; }
  }
</style>
