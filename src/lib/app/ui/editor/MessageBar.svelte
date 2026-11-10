<script lang="ts">
  // From the panels' column to the window's other edge, empty: the canvas's bottom inset.
  // Messages float above it, in the middle, stacked: the latest at the bottom, then the
  // work in progress (saving, opening…).
  import { X } from "@lucide/svelte";
  import type { Message } from "#lib/app/state/messages.svelte.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    messages,
    busy,
    ondismiss,
    left,
    sliding,
    hidden,
    element = $bindable(),
  }: {
    /** The messages shown, the oldest first (see Messages). */
    messages: readonly Message[];
    /** The work in progress, if any: under the messages. */
    busy: string | null;
    /** Closes a message: errors have a button for it. */
    ondismiss: (id: number) => void;
    /** The panels' column is on the left. */
    left: boolean;
    /** The column is opening or closing: the bar follows it. */
    sliding: boolean;
    /** Only the canvas shows. */
    hidden: boolean;
    element?: HTMLElement;
  } = $props();
</script>

<div class="bottom" class:left class:sliding class:hidden bind:this={element}>
  <div class="stack">
    {#each messages as message (message.id)}
      <div class="panel message" class:error={message.level === "error"}>
        <span class="text">{message.text}</span>
        {#if message.level === "error"}
          <button
            class="icon"
            title={m.common_close()}
            aria-label={m.common_close()}
            onclick={() => ondismiss(message.id)}
          >
            <X class="icon-small" />
          </button>
        {/if}
      </div>
    {/each}
    {#if busy}
      <div class="panel message"><span class="text">{busy}</span></div>
    {/if}
  </div>
</div>

<style>
  .bottom {
    position: absolute;
    bottom: var(--space);
    left: var(--space);
    right: calc(var(--column-space) + var(--space));
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 0;
    pointer-events: none;
  }

  .left {
    left: calc(var(--column-space) + var(--space));
    right: var(--space);
  }

  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--space) / 2);
    max-width: 100%;
  }

  .message {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    max-width: 100%;
    padding: calc(var(--space) / 2) var(--space);
    color: var(--text-muted);
  }

  .text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* With its close button: the rest lets the pointer through to the canvas. */
  .message.error {
    color: var(--danger);
    pointer-events: auto;
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
