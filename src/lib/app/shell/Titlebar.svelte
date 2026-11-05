<script lang="ts">
  // The window's title bar, drawn by the app (like Zed or Discord): the system one is
  // turned off (`decorations: false`). Drag it to move the window, double-click it to
  // maximize. Outside of Tauri (dev server), the buttons do nothing. The page can put its
  // menus on the left, and more before the window buttons (see window-title.svelte.ts).

  import { onMount, type Snippet } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let {
    title,
    dirty,
    menu,
    end,
    dimmed = false,
  }: {
    title: string;
    dirty: boolean;
    menu?: Snippet | null;
    /** Before the window buttons, e.g. the layout menu. */
    end?: Snippet | null;
    /** Under a dialog's overlay, except the window buttons. */
    dimmed?: boolean;
  } = $props();

  let maximized = $state(false);
  const appWindow = isTauri() ? getCurrentWindow() : null;

  onMount(() => {
    if (!appWindow) return;
    const update = async () => (maximized = await appWindow.isMaximized());
    update();
    const unlisten = appWindow.onResized(update);
    return () => void unlisten.then((fn) => fn());
  });

  function onMouseDown(e: MouseEvent) {
    if (!appWindow || e.button !== 0) return;
    if ((e.target as Element).closest("button")) return;
    if (e.detail === 2) appWindow.toggleMaximize();
    else appWindow.startDragging();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="titlebar" class:dimmed onmousedown={onMouseDown}>
  <div class="bar">
    {@render menu?.()}

    <span class="title">
      {#if dirty}<span class="dirty" title="Unsaved changes">●</span>{/if}
      {title}
    </span>

    <div class="end">{@render end?.()}</div>

    <div class="controls">
      <button title="Minimize" aria-label="Minimize" onclick={() => appWindow?.minimize()}>
        <svg viewBox="0 0 10 10"><path d="M0 5.5h10" /></svg>
      </button>
      <button
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        onclick={() => appWindow?.toggleMaximize()}
      >
        {#if maximized}
          <svg viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
        {:else}
          <svg viewBox="0 0 10 10"><path d="M.5 .5h9v9h-9z" /></svg>
        {/if}
      </button>
      <!-- Goes through the close request, which offers to save unsaved changes. -->
      <button class="close" title="Close" aria-label="Close" onclick={() => appWindow?.close()}>
        <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>
      </button>
    </div>
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

  /* A floating bar, styled like the panels (the lab pages don't load their styles). */
  .bar {
    position: relative;
    display: flex;
    flex: 1;
    align-items: stretch;
    box-sizing: border-box;
    min-width: 0;
    /* As tall as the editor's bars. */
    height: calc(var(--control-height) + var(--space));
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  /* Centered in the window by the layout (a transform could blur it), whatever is on
     either side. Clicks go through to the bar, to drag the window. */
  .title {
    position: absolute;
    inset: 0;
    display: flex;
    gap: calc(var(--space) / 2);
    align-items: center;
    width: max-content;
    max-width: 40%;
    margin: 0 auto;
    overflow: hidden;
    pointer-events: none;
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dirty {
    color: var(--text-faint);
    font-size: 0.8em;
  }

  .end {
    display: flex;
    align-items: center;
    margin-left: auto;
  }

  .controls {
    display: flex;
    gap: 2px;
    align-items: center;
    padding: 0 calc(var(--space) / 2);
  }

  /* Rounded, like the other buttons of the app. Styled here entirely, as the lab pages
     don't load the interface's base styles. */
  .controls button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(36px * var(--ui-scale));
    height: var(--control-height);
    padding: 0;
    color: var(--text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-small);
  }

  .controls button:hover {
    color: var(--text);
    background: var(--hover);
  }

  .controls .close:hover {
    color: var(--window-close-text);
    background: var(--window-close);
  }

  svg {
    width: calc(10px * var(--ui-scale));
    height: calc(10px * var(--ui-scale));
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .close svg {
    shape-rendering: geometricPrecision;
  }
</style>
