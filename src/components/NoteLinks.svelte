<script lang="ts">
  import { api } from "../lib/api";
  import { parseNoteLinks } from "../lib/links";

  let { note }: { note: string } = $props();

  /** Notes stay plain text; a recognized link opens in the system handler,
      never as navigation inside the app's webview. */
  function openLink(e: MouseEvent, url: string) {
    e.preventDefault();
    api.openExternal(url).catch((err) => console.error("open_external failed:", err));
  }
</script>

{#each parseNoteLinks(note) as part}
  {#if part.kind === "link"}
    <a href={part.url} onclick={(e) => openLink(e, part.url)}>{part.text}</a>
  {:else}{part.text}{/if}
{/each}

<style>
  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
