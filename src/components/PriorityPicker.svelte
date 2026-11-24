<script lang="ts">
  import type { Priority } from "../lib/api";
  import { t } from "../lib/i18n.svelte";
  import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Select from "./Select.svelte";

  let { priority = $bindable("normal") }: { priority?: Priority } = $props();

  const LEVELS = ["low", "normal", "high", "critical"] as const;
  const options = $derived(LEVELS.map((value) => ({
    value,
    label: t(`priority.${value}`),
    description: t(`priority.${value}_desc`),
  })));

  function choose(value: string) {
    const level = LEVELS.find((candidate) => candidate === value);
    if (level) priority = level;
  }
</script>

{#snippet content(option: { value: string; label: string; description?: string }, inList: boolean)}
  <span class="prio-icon prio-{option.value}" aria-hidden="true">
    {#if option.value === "critical"}
      <ChevronsUp size={18} strokeWidth={2.5} />
    {:else if option.value === "high"}
      <ChevronUp size={18} strokeWidth={2.5} />
    {:else if option.value === "normal"}
      <Circle size={16} />
    {:else}
      <ChevronDown size={18} strokeWidth={2.5} />
    {/if}
  </span>
  <span class="body" class:closed={!inList} aria-hidden="true">
    <span class="name" class:in-list={inList}>
      {option.label}
      {#if inList}
        <span class="quad-hint">
          {t(option.value === "high" || option.value === "critical" ? "priority.important" : "priority.not_important")}
        </span>
      {/if}
    </span>
    <span class="desc">{option.description}</span>
  </span>
{/snippet}

<Select value={priority} {options} ariaLabel={t("editor.priority_label")} onchange={choose} presentation="priority" {content} />

<style>
  .body { min-width: 0; }
  .body.closed { flex: 1; }
  .name.in-list { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 14px; }
  .desc { display: block; color: var(--muted); font-size: 12px; margin-top: 1px; }
  .closed .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quad-hint {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    padding: 1px 6px;
    border-radius: 20px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
</style>
