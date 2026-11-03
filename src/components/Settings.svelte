<script lang="ts">
  import "./Settings.css";
  import { onMount, type Component } from "svelte";
  import { api, type LocaleInfo } from "../lib/api";
  import { t, loadLocale } from "../lib/i18n.svelte";
  import { radioGroup } from "../lib/radio-group";
  import { ACCENTS, applyTheme } from "../lib/theme";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowDownLeft from "@lucide/svelte/icons/arrow-down-left";
  import ArrowDownRight from "@lucide/svelte/icons/arrow-down-right";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowUpLeft from "@lucide/svelte/icons/arrow-up-left";
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
  import Bell from "@lucide/svelte/icons/bell";
  import Check from "@lucide/svelte/icons/check";
  import Circle from "@lucide/svelte/icons/circle";
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
  const CORNERS = [
    "top-left", "center-top", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "center-bottom", "bottom-right",
  ] as const;
  const CORNER_ICONS: Record<(typeof CORNERS)[number], Component> = {
    "top-left": ArrowUpLeft, "center-top": ArrowUp, "top-right": ArrowUpRight,
    "center-left": ArrowLeft, center: Circle, "center-right": ArrowRight,
    "bottom-left": ArrowDownLeft, "center-bottom": ArrowDown, "bottom-right": ArrowDownRight,
  };

  function cornerLabel(corner: string): string {
    return t(`corner.${corner.replace("-", "_")}`);
  }

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
            <select value={language} onchange={(event) => { language = event.currentTarget.value; void persist(); }}>
              {#each locales as locale (locale.code)}
                <option value={locale.code}>{locale.name}</option>
              {/each}
            </select>
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
          <div class="settings-field">
            <span>{t("settings.popup_corner")}</span>
            <div class="settings-monitor">
              <div class="settings-screen">
                <div class="settings-arrows" role="radiogroup" aria-label={t("settings.popup_corner")} dir="ltr" use:radioGroup={3}>
                  {#each CORNERS as corner (corner)}
                    {@const CornerIcon = CORNER_ICONS[corner]}
                    <button type="button" aria-label={cornerLabel(corner)} role="radio" aria-checked={popupCorner === corner}
                      tabindex={popupCorner === corner ? 0 : -1} onclick={() => { popupCorner = corner; void persist(); }}>
                      <CornerIcon size={corner === "center" ? 10 : 20} aria-hidden="true" />
                    </button>
                  {/each}
                </div>
              </div>
              <div class="settings-monitor-stand" aria-hidden="true"><span></span></div>
            </div>
            <span class="settings-position" aria-live="polite">{cornerLabel(popupCorner)}</span>
          </div>
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
