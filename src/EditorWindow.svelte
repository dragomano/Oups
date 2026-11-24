<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { listen } from "@tauri-apps/api/event";
  import ReminderEditor from "./components/ReminderEditor.svelte";
  import { api, type Reminder } from "./lib/api";
  import { loadLocale } from "./lib/i18n.svelte";
  import { observeModalHeight, usesNativeModalFrame } from "./lib/modal-content";
  import { applyTheme } from "./lib/theme";

  const nativeFrame = usesNativeModalFrame();

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
    return observeModalHeight([header, form, footer], api.fitEditorWindow, () => {
      if (content) node.style.setProperty("--editor-gutter", `${content.offsetWidth - content.clientWidth}px`);
    });
  }
</script>

{#if ready}
  <div class="editor-window" use:fitContent>
    <ReminderEditor {reminder} {nativeFrame} onClose={() => void getCurrentWebviewWindow().close()} />
  </div>
{/if}
