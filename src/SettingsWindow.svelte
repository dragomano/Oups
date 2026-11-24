<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import Settings from "./components/Settings.svelte";
  import { api, type LocaleInfo, type SettingsView } from "./lib/api";
  import { loadLocale } from "./lib/i18n.svelte";
  import { observeModalHeight, usesNativeModalFrame } from "./lib/modal-content";
  import { applyTheme } from "./lib/theme";

  const nativeFrame = usesNativeModalFrame();
  let content = $state<{ settings: SettingsView; locales: LocaleInfo[] }>();

  onMount(async () => {
    const [settings, locales] = await Promise.all([
      api.getSettings(),
      api.listLocales().catch((error) => {
        console.error("failed to list locales", error);
        return [];
      }),
    ]);
    applyTheme(settings.theme, settings.accent);
    await loadLocale(settings.language);
    content = { settings, locales };
  });

  function fitContent(node: HTMLElement) {
    const header = node.querySelector<HTMLElement>(".settings-head");
    const grid = node.querySelector<HTMLElement>(".settings-grid");
    const footer = node.querySelector<HTMLElement>(".settings-footer");
    return observeModalHeight([header, grid, footer], api.fitSettingsWindow);
  }
</script>

{#if content}
  <div use:fitContent>
    <Settings {...content} {nativeFrame} onClose={() => void getCurrentWebviewWindow().close()} />
  </div>
{/if}
