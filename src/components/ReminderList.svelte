<script lang="ts">
  import ReminderRow from "./ReminderRow.svelte";
  import { t } from "../lib/i18n.svelte";
  import BellOff from "@lucide/svelte/icons/bell-off";
  import type { Reminder } from "../lib/api";

  let {
    reminders,
    loading,
    onEdit,
    onDuplicate,
  }: {
    reminders: Reminder[];
    loading: boolean;
    onEdit: (r: Reminder) => void;
    onDuplicate: (r: Reminder) => void;
  } = $props();
</script>

{#if loading}
  <div class="placeholder">…</div>
{:else if reminders.length === 0}
  <div class="placeholder" role="status">
    <div class="big"><BellOff size={40} strokeWidth={1.5} aria-hidden="true" /></div>
    <div class="title">{t("list.empty_title")}</div>
    <div class="hint">{t("list.empty_hint")}</div>
  </div>
{:else}
  <ul class="list">
    {#each reminders as r (r.id)}
      <ReminderRow {r} onEdit={() => onEdit(r)} onDuplicate={() => onDuplicate(r)} />
    {/each}
  </ul>
{/if}

<style>
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 80px 20px;
    color: var(--muted);
    text-align: center;
  }

  .placeholder .big {
    color: var(--muted);
    line-height: 1;
  }

  .placeholder .title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
</style>
