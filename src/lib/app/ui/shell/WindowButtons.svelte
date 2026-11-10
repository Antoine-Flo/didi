<script lang="ts">
  // Minimize, maximize and close, for a window of the desktop app without the system's
  // title bar (see Titlebar, and the preview window). Nothing in a browser.

  import { onMount } from "svelte";
  import { appWindow as ownWindow } from "#lib/platform/window.js";
  import { m } from "#lib/paraglide/messages.js";

  let maximized = $state(false);
  // A local const: TypeScript knows it stays non-null in the handlers below.
  const appWindow = ownWindow;

  onMount(() => {
    if (!appWindow) {
      return;
    }
    const update = async () => (maximized = await appWindow.isMaximized());
    void update();
    const unlisten = appWindow.onResized(update);
    return () => void unlisten.then((fn) => fn());
  });
</script>

{#if appWindow}
  <div class="window-buttons">
    <button
      title={m.window_buttons_minimize()}
      aria-label={m.window_buttons_minimize()}
      onclick={() => appWindow.minimize()}
    >
      <svg viewBox="0 0 10 10"><path d="M0 5.5h10" /></svg>
    </button>
    <button
      title={maximized ? m.window_buttons_restore() : m.window_buttons_maximize()}
      aria-label={maximized ? m.window_buttons_restore() : m.window_buttons_maximize()}
      onclick={() => appWindow.toggleMaximize()}
    >
      {#if maximized}
        <svg viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
      {:else}
        <svg viewBox="0 0 10 10"><path d="M.5 .5h9v9h-9z" /></svg>
      {/if}
    </button>
    <!-- Goes through the close request: the editor offers to save unsaved changes. -->
    <button
      class="close"
      title={m.common_close()}
      aria-label={m.common_close()}
      onclick={() => appWindow.close()}
    >
      <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>
    </button>
  </div>
{/if}

<style>
  .window-buttons {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  /* Rounded, like the other buttons of the app. Styled here entirely, as the lab pages
     don't load the interface's base styles. */
  button {
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

  button:hover {
    color: var(--text);
    background: var(--hover);
  }

  .close:hover {
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
