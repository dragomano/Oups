<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import Settings from "./components/Settings.svelte";
  import { api } from "./lib/api";
  import { loadLocale } from "./lib/i18n.svelte";
  import { applyTheme } from "./lib/theme";

  let ready = $state(false);
  onMount(async () => {
    const settings = await api.getSettings();
    applyTheme(settings.theme, settings.accent);
    await loadLocale(settings.language);
    ready = true;
  });

  function fitContent(node: HTMLElement) {
    const header = node.querySelector<HTMLElement>(".settings-head");
    const grid = node.querySelector<HTMLElement>(".settings-grid");
    const footer = node.querySelector<HTMLElement>(".settings-footer");
    let frame = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!header || !grid || !footer || !node.querySelector(".settings-swatches")) return;
        const height = Math.ceil(header.offsetHeight + grid.offsetHeight + footer.offsetHeight);
        if (height === lastHeight) return;
        lastHeight = height;
        void api.fitSettingsWindow(height).catch(error => console.error("failed to fit settings window", error));
      });
    });
    for (const part of [header, grid, footer]) if (part) observer.observe(part);
    return { destroy: () => { observer.disconnect(); cancelAnimationFrame(frame); } };
  }
</script>

{#if ready}
  <div use:fitContent>
    <Settings onClose={() => void getCurrentWebviewWindow().close()} />
  </div>
{/if}
