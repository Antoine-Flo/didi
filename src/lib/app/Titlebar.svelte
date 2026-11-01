<script lang="ts">
  // The window's title bar, drawn by the app (like Zed or Discord): the system one is
  // turned off (`decorations: false`). Drag it to move the window, double-click it to
  // maximize. Outside of Tauri (dev server), the buttons do nothing.

  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let { title, dirty }: { title: string; dirty: boolean } = $props();

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
<header class="titlebar" onmousedown={onMouseDown}>
  <span class="title">
    {#if dirty}<span class="dirty" title="Unsaved changes">●</span>{/if}
    {title}
  </span>

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
</header>

<style>
  .titlebar {
    position: relative;
    /* Above dialogs and their overlay: the window stays movable and closable. */
    z-index: 70;
    display: flex;
    flex: none;
    align-items: stretch;
    box-sizing: border-box;
    height: var(--titlebar-height);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    font-family: var(--font);
    font-size: var(--font-size);
    user-select: none;
  }

  .title {
    display: flex;
    flex: 1;
    gap: calc(var(--space) / 2);
    align-items: center;
    min-width: 0;
    padding: 0 calc(var(--space) * 1.5);
    overflow: hidden;
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dirty {
    color: var(--text-faint);
    font-size: 0.8em;
  }

  .controls {
    display: flex;
  }

  /* Like Windows 11 and Discord: wide, flat buttons the height of the bar. Styled here
     entirely, as the lab pages don't load the interface's base styles. */
  .controls button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    padding: 0;
    color: var(--text-muted);
    background: none;
    border: none;
    border-radius: 0;
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
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .close svg {
    shape-rendering: geometricPrecision;
  }
</style>
