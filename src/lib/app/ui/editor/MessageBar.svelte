<script lang="ts">
  // From the panels' column to the window's other edge, empty: the canvas's bottom inset.
  // Messages float above it, in the middle.
  let {
    message,
    error,
    left,
    sliding,
    hidden,
    element = $bindable(),
  }: {
    /** The message shown, if any. */
    message: string | null;
    /** It is an error. */
    error: boolean;
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
  {#if message}
    <div class="panel message" class:error>{message}</div>
  {/if}
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

  .message {
    max-width: 100%;
    padding: calc(var(--space) / 2) var(--space);
    overflow: hidden;
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .message.error {
    color: var(--danger);
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
