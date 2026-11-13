<script lang="ts">
  // The start screen's choice of a new document: the sizes offered, a custom size, and the
  // background. See NewDocumentChoice.

  import {
    MAX_SIZE,
    SIZE_PRESETS,
    type NewDocumentChoice,
  } from "#lib/app/files/new-document-choice.svelte.js";
  import { m } from "#lib/paraglide/messages.js";

  let { choice }: { choice: NewDocumentChoice } = $props();
</script>

{#each SIZE_PRESETS as { group, sizes } (group)}
  <div class="group">
    <span class="label">{group}</span>
    <div class="sizes">
      {#each sizes as [w, h] (`${w}x${h}`)}
        <button
          class="size"
          class:active={w === choice.width && h === choice.height}
          onclick={() => choice.setSize(w, h)}>{w} × {h}</button
        >
      {/each}
    </div>
  </div>
{/each}

<div class="group">
  <span class="label">{m.start_custom()}</span>
  <div class="row">
    <input
      type="number"
      min="1"
      max={MAX_SIZE}
      bind:value={choice.width}
      oninput={() => choice.edited()}
      aria-label={m.image_size_width()}
    />
    <span>×</span>
    <input
      type="number"
      min="1"
      max={MAX_SIZE}
      bind:value={choice.height}
      oninput={() => choice.edited()}
      aria-label={m.image_size_height()}
    />
  </div>
</div>

<div class="group">
  <span class="label">{m.start_background()}</span>
  <div class="row toggle">
    <button
      class:active={choice.background === "white"}
      onclick={() => choice.setBackground("white")}
    >
      {m.start_white()}
    </button>
    <button
      class:active={choice.background === "transparent"}
      onclick={() => choice.setBackground("transparent")}
    >
      {m.start_transparent()}
    </button>
  </div>
</div>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
  }

  .label {
    color: var(--text-muted);
  }

  .sizes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(88px * var(--ui-scale)), 1fr));
    gap: calc(var(--space) / 2);
  }

  .size {
    background: var(--field);
    border: 1px solid var(--field-border);
    font-variant-numeric: tabular-nums;
  }

  .size:hover {
    background: var(--hover);
    border-color: var(--text-faint);
  }

  /* The size that will be created: a highlighted border. */
  .size.active {
    border-color: var(--text-faint);
  }

  .row {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
  }

  input {
    box-sizing: border-box;
    width: calc(72px * var(--ui-scale));
    height: var(--control-height);
    padding: 0 var(--space);
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }

  .toggle button {
    flex: 1;
    background: var(--field);
    border: 1px solid var(--field-border);
  }

  .toggle button.active {
    background: var(--selected);
  }
</style>
