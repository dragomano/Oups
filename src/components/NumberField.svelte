<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "../lib/i18n.svelte";

  let {
    value = $bindable(1),
    min,
    max,
    step = 1,
    ariaLabel = "",
  }: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    ariaLabel?: string;
  } = $props();

  // Text that is not a number reports NaN, the way a native number input reports
  // an empty field, so the form can reject it; the commit is what clamps it.
  const parsed = (raw: string) => (raw.trim() ? Number(raw) : Number.NaN);

  let input = $state<HTMLInputElement>();
  let current = $state(String(value));

  $effect(() => {
    const next = value;

    untrack(() => {
      // A half-typed or cleared field belongs to the user until it is committed.
      if (document.activeElement !== input && (Number.isNaN(next) || parsed(current) !== next)) {
        current = String(next);
      }
    });
  });

  function clamp(next: number): number {
    if (min !== undefined && next < min) return min;
    if (max !== undefined && next > max) return max;

    return next;
  }

  function show(next: number) {
    value = next;
    current = String(next);
  }

  function commit(raw: string) {
    const next = parsed(raw);

    show(Number.isFinite(next) ? clamp(Math.trunc(next)) : (min ?? 0));
  }

  function bump(delta: number) {
    const base = parsed(current);

    show(
      clamp(
        (Number.isFinite(base) ? Math.trunc(base) : (min ?? 0)) + delta * Math.max(1, Math.floor(step) || 1),
      ),
    );
  }
</script>

<div class="number-field">
  <input
    class="number-input"
    bind:this={input}
    type="text"
    inputmode="numeric"
    aria-label={ariaLabel}
    value={current}
    oninput={(event) => {
      current = event.currentTarget.value;

      const next = parsed(current);

      // Out-of-range input stays visible until the field is left, so the form
      // can report it; the commit is what clamps it.
      value = next;
    }}
    onchange={(event) => commit(event.currentTarget.value)}
    onblur={(event) => commit(event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

      event.preventDefault();
      bump(event.key === "ArrowUp" ? 1 : -1);
    }}
  />
  <div class="number-steps">
    <button type="button" class="step up" aria-label={t("number.increase")} onclick={() => bump(1)}></button>
    <button type="button" class="step down" aria-label={t("number.decrease")} onclick={() => bump(-1)}></button>
  </div>
</div>

<style>
  /* A compact field with the accent border on focus and the up/down steppers
     on the right. The input is boxed like the other triggers, so the field is
     exactly as tall as the select next to it. */
  .number-field {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    min-height: 34px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }

  .number-field:focus-within {
    border-color: var(--accent);
  }

  .number-input {
    flex: 1;
    min-width: 0;
    padding: 7px 8px;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    outline: none;
  }

  .number-steps {
    display: flex;
    flex: none;
    flex-direction: column;
    width: 22px;
  }

  .step {
    position: relative;
    flex: 1;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .step:hover {
    background: var(--panel-2);
    color: var(--text);
  }

  .step::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-inline: 4px solid transparent;
    transform: translate(-50%, -50%);
  }

  .step.up::before {
    border-bottom: 5px solid currentColor;
  }

  .step.down::before {
    border-top: 5px solid currentColor;
  }
</style>
