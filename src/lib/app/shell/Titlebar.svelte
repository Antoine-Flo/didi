<script lang="ts">
  // The window's title bar, drawn by the app (like Zed or Discord): the system one is
  // turned off (`decorations: false`). Drag it to move the window, double-click it to
  // maximize. In a browser, which has its own window, it has no window buttons. The page can
  // put its menus on the left, something in the middle (the name by default), and more before
  // the window buttons (see window-title.svelte.ts). Each is a floating group of its own, with
  // nothing between them: the canvas shows through.

  import type { Snippet } from "svelte";
  import { appWindow } from "#lib/platform/window.js";
  import { m } from "#lib/paraglide/messages.js";
  import WindowButtons from "#lib/app/shell/WindowButtons.svelte";

  let {
    title,
    dirty,
    menu,
    end,
    center,
    dimmed = false,
  }: {
    title: string;
    dirty: boolean;
    menu?: Snippet | null;
    /** Before the window buttons, e.g. the layout menu. */
    end?: Snippet | null;
    /** Instead of the title, in the middle, e.g. the tool's options. */
    center?: Snippet | null;
    /** Under a dialog's overlay, except the window buttons. */
    dimmed?: boolean;
  } = $props();

  function onMouseDown(e: MouseEvent) {
    if (!appWindow || e.button !== 0) {
      return;
    }
    // Not from a control: a slider would move the window.
    if ((e.target as Element).closest("button, input, label, select, [role='slider']")) {
      return;
    }
    if (e.detail === 2) {
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="titlebar" class:dimmed onmousedown={onMouseDown}>
  <div class="bar">
    {#if menu}
      <div class="group">{@render menu()}</div>
    {/if}

    <div class="middle">
      {#if center}
        <div class="group center">{@render center()}</div>
      {:else if title}
        <span class="group title">
          {#if dirty}<span class="dirty" title={m.titlebar_unsaved()}>●</span>{/if}
          {title}
        </span>
      {/if}
    </div>

    {#if end || appWindow}
      <div class="group end">
        {@render end?.()}
        {#if appWindow}
          <div class="controls"><WindowButtons /></div>
        {/if}
      </div>
    {/if}
  </div>
</header>

<style>
  .titlebar {
    position: relative;
    /* Above dialogs and their overlay: the window stays movable and closable. Clickable
       even while a dialog is open, when Bits UI turns off pointer events on the page. */
    z-index: 70;
    pointer-events: auto;
    display: flex;
    flex: none;
    box-sizing: border-box;
    height: var(--titlebar-height);
    /* Inset from the window's edges, like the panels below. Transparent around the bar:
       the editor's canvas goes under it. */
    padding: var(--space) var(--space) 0;
    font-family: var(--font);
    font-size: var(--font-size);
    user-select: none;
  }

  /* While a dialog is open: dimmed like the rest of the window, but the window buttons
     stay above, and the bar can still be dragged through. */
  .dimmed::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: var(--overlay);
    pointer-events: none;
  }

  .dimmed .controls {
    position: relative;
    z-index: 2;
  }

  /* The groups side by side, as tall as the editor's bars, with gaps between them. */
  .bar {
    display: flex;
    flex: 1;
    gap: var(--space);
    min-width: 0;
    height: calc(var(--control-height) + var(--space));
  }

  /* A floating group, styled like the panels (the lab pages don't load their styles). */
  .group {
    display: flex;
    flex: none;
    align-items: stretch;
    box-sizing: border-box;
    min-width: 0;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  /* The room between the menus and the end, its group centered in it, as wide as what it
     holds, or as the room. The rest is empty, to drag the window. */
  .middle {
    display: flex;
    flex: 1;
    justify-content: center;
    min-width: 0;
  }

  .middle > .group {
    flex: 0 1 auto;
  }

  .center > :global(*) {
    flex: 0 1 auto;
    min-width: 0;
  }

  .title {
    gap: calc(var(--space) / 2);
    align-items: center;
    padding: 0 var(--space);
    overflow: hidden;
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dirty {
    color: var(--text-faint);
    font-size: 0.8em;
  }

  .end {
    align-items: center;
  }

  /* No window buttons after it: the same space as they leave at the end. */
  .end > :global(:last-child:not(.controls)) {
    margin-right: calc(var(--space) / 2);
  }

  .controls {
    display: flex;
    align-items: center;
    padding: 0 calc(var(--space) / 2);
  }
</style>
