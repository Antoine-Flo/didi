<script lang="ts">
  // The document's mode (pixel art, painting), in the status bar: a small segmented
  // control. Each button runs a command.

  import type { Mode } from "#lib/app/modes/mode.js";

  let {
    modes,
    mode,
    tip,
    run,
  }: {
    modes: Mode[];
    /** Id of the current mode. */
    mode: string;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();
</script>

<div class="modes" role="radiogroup" aria-label="Mode">
  {#each modes as m (m.id)}
    <button
      class:active={m.id === mode}
      role="radio"
      aria-checked={m.id === mode}
      title={tip(`mode.${m.id}`)}
      onclick={() => run(`mode.${m.id}`)}
    >
      {m.title}
    </button>
  {/each}
</div>

<style>
  .modes {
    display: flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    background: var(--field);
    border-radius: var(--radius);
  }

  /* A little smaller than the other buttons, to fit in the bar with its background. */
  button {
    height: calc(var(--control-height) - 4px);
    color: var(--text-muted);
    white-space: nowrap;
  }

  button.active {
    color: var(--text);
  }
</style>
