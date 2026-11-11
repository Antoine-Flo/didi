<script lang="ts">
  // The start screen's choice of a new document: the mode first (two large cards), then the
  // sizes it offers, a custom size, and the background. See NewDocumentChoice.

  import { MAX_SIZE, type NewDocumentChoice } from "#lib/app/files/new-document-choice.svelte.js";
  import type { Mode } from "#lib/app/modes/mode.js";
  import { m } from "#lib/paraglide/messages.js";

  let { choice, modes }: { choice: NewDocumentChoice; modes: readonly Mode[] } = $props();
</script>

<div class="modes" role="radiogroup" aria-label={m.start_mode()}>
  {#each modes as mode (mode.id)}
    {@const Icon = mode.icon}
    <button
      class="mode"
      class:active={mode.id === choice.mode.id}
      role="radio"
      aria-checked={mode.id === choice.mode.id}
      onclick={() => choice.choose(mode)}
    >
      <span class="mode-title"><Icon class="icon-large" /> {mode.title}</span>
      <span class="mode-description">{mode.description}</span>
    </button>
  {/each}
</div>

{#each choice.mode.newDocument.presets as { group, sizes } (group)}
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

  /* The mode comes first and must be obvious: two large cards. */
  .modes {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: var(--space);
  }

  .mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--space) / 2);
    height: auto;
    padding: var(--space);
    text-align: left;
    white-space: normal;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
  }

  .mode:hover {
    background: var(--hover);
  }

  /* The chosen mode: the same highlighted border as the chosen size. */
  .mode.active {
    border-color: var(--text-faint);
  }

  .mode-title {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    font-weight: 600;
  }

  .mode-description {
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

  /* The size that will be created: the same highlighted border as the chosen mode. */
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
