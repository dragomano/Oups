<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import Copy from "@lucide/svelte/icons/copy";
  import Minus from "@lucide/svelte/icons/minus";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import { api, type WindowControl } from "../lib/api";
  import { t } from "../lib/i18n.svelte";

  let maximized = $state(false);

  function send(action: WindowControl) {
    void api.windowControl(action);
  }

  onMount(() => {
    void api.windowMaximized().then((m) => (maximized = m));
    const unlisten = listen("tauri://resize", () => {
      void api.windowMaximized().then((m) => (maximized = m));
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  });
</script>

<!-- The window's caption buttons. They live in the title strip, next to the
     app's own name, the way a native caption area does. -->
<div class="caption">
  <span class="divider" aria-hidden="true"></span>
  <button class="cap-btn" type="button" title={t("window.minimize")} aria-label={t("window.minimize")} onclick={() => send("minimize")}>
    <Minus size={16} aria-hidden="true" />
  </button>
  <button class="cap-btn" type="button" title={maximized ? t("window.restore") : t("window.maximize")}
    aria-label={maximized ? t("window.restore") : t("window.maximize")} onclick={() => send("toggle-maximize")}>
    {#if maximized}
      <Copy size={16} aria-hidden="true" />
    {:else}
      <Square size={16} aria-hidden="true" />
    {/if}
  </button>
  <button class="cap-btn close" type="button" title={t("window.close")} aria-label={t("window.close")} onclick={() => send("close")}>
    <X size={16} aria-hidden="true" />
  </button>
</div>

<style>
  .caption {
    display: flex;
    gap: 2px;
  }

  .divider {
    flex: none;
    align-self: center;
    width: 1px;
    height: 18px;
    margin-inline-end: 6px;
    background: var(--border);
  }

  .cap-btn {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    line-height: 1;
    cursor: default;
  }

  /* The neutral fill is scoped away from the close button, so that one keeps
     the shared red hover (button.close in app.css) — a scoped rule left on
     :hover would outrank the shared one and leave the glyph grey on red. */
  .cap-btn:not(.close):hover {
    background: var(--panel-2);
    color: var(--text);
  }
</style>
