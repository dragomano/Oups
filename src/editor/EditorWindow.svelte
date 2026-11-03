<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { listen } from "@tauri-apps/api/event";
  import ReminderEditor from "../components/ReminderEditor.svelte";
  import { api, type Reminder } from "../lib/api";
  import { loadLocale } from "../lib/i18n.svelte";
  import { applyTheme } from "../lib/theme";

  let ready = $state(false);
  let reminder = $state<Reminder | null>(null);

  async function appearance() {
    const settings = await api.getSettings();
    applyTheme(settings.theme, settings.accent);
    await loadLocale(settings.language);
  }

  onMount(() => {
    const unlisten = listen("settings-changed", appearance);
    void Promise.all([appearance(), api.getEditorReminder()]).then(([, draft]) => {
      reminder = draft;
      ready = true;
    });
    return () => { void unlisten.then((stop) => stop()); };
  });

  function fitContent(node: HTMLElement) {
    const form = node.querySelector<HTMLElement>(".editor-form");
    const footer = node.querySelector<HTMLElement>(".footer");
    const content = node.querySelector<HTMLElement>(".editor-content");
    const header = node.querySelector<HTMLElement>(".editor-head");
    let lastHeight = 0;
    let frame = 0;
    function fit() {
      if (!form || !footer) return;
      if (content) node.style.setProperty("--editor-gutter", `${content.offsetWidth - content.clientWidth}px`);
      const height = Math.ceil((header?.getBoundingClientRect().height ?? 0) + form.getBoundingClientRect().height + footer.getBoundingClientRect().height);
      if (height === lastHeight) return;
      lastHeight = height;
      void api.fitEditorWindow(height).catch((error) => console.error("failed to fit editor window", error));
    }
    // Apply layout changes on the next frame, outside ResizeObserver delivery.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    if (form) observer.observe(form);
    if (footer) observer.observe(footer);
    if (header) observer.observe(header);
    return { destroy: () => { observer.disconnect(); cancelAnimationFrame(frame); } };
  }
</script>

{#if ready}
  <div class="editor-window" use:fitContent>
    <ReminderEditor {reminder} onClose={() => void getCurrentWebviewWindow().close()} />
  </div>
{/if}
