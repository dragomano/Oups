<script lang="ts">
  import { api } from "../lib/api";
  import { t } from "../lib/i18n.svelte";
  import { parseNoteLinks } from "../lib/links";

  let { note }: { note: string } = $props();

  /** Notes stay plain text; a recognized link opens in the system handler,
      never as navigation inside the app's webview. */
  function openLink(e: MouseEvent, url: string) {
    e.preventDefault();
    api.openExternal(url).catch((err) => alert(t("msg.action_failed", { err: String(err) })));
  }
</script>

{#each parseNoteLinks(note) as part}
  {#if part.kind === "link"}
    <a href={part.url} onclick={(e) => openLink(e, part.url)}>{part.text}</a>
  {:else}{part.text}{/if}
{/each}

<style>
  a {
    color: inherit;
    text-decoration: underline;
  }

  a:hover { text-decoration-thickness: 2px; }
</style>
