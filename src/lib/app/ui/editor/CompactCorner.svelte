<script lang="ts">
  // When compact, undo and redo below the tools, in the bottom corner: no keyboard on a phone,
  // and within the other hand's reach. Beside them, the actions on the selection, while there
  // is one.
  import type { Snippet } from "svelte";
  import { Redo2, Undo2 } from "@lucide/svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    left,
    sliding,
    hidden,
    tip,
    enabled,
    run,
    actions,
  }: {
    /** The panels' column is on the left: so is this corner. */
    left: boolean;
    /** The column is opening or closing: the corner follows it. */
    sliding: boolean;
    /** Only the canvas shows. */
    hidden: boolean;
    tip: (id: string) => string;
    enabled: (id: string) => boolean;
    run: (id: string) => void;
    /** The actions on the selection. */
    actions: Snippet;
  } = $props();
</script>

<div class="corner" class:left class:sliding class:hidden>
  <div class="panel" role="group" aria-label={m.editor_history()}>
    {#each ["history.undo", "history.redo"] as id (id)}
      <button class="icon" title={tip(id)} disabled={!enabled(id)} onclick={() => run(id)}>
        {#if id === "history.undo"}<Undo2 />{:else}<Redo2 />{/if}
      </button>
    {/each}
  </div>
  {#if enabled("selection.deselect")}
    <div class="panel">{@render actions()}</div>
  {/if}
</div>

<style>
  /* Undo and redo, in the bottom corner on the tools' side, below them, then the actions on
     the selection, towards the middle. */
  .corner {
    position: absolute;
    z-index: 1;
    bottom: var(--space);
    right: calc(var(--column-space) + var(--space));
    display: flex;
    flex-direction: row-reverse;
    gap: var(--space);
  }

  .left {
    right: auto;
    left: calc(var(--column-space) + var(--space));
    flex-direction: row;
  }

  .panel {
    display: flex;
    gap: 2px;
    padding: calc(var(--space) / 2);
  }

  /* Only the canvas (Tab). */
  .hidden {
    visibility: hidden;
  }

  /* Opening or closing: it follows the column. */
  .sliding {
    transition:
      transform 0.2s ease,
      visibility 0.2s,
      left 0.2s ease,
      right 0.2s ease;
  }
</style>
