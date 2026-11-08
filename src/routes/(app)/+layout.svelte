<script lang="ts">
  import type { Snippet } from "svelte";
  import Titlebar from "#lib/app/shell/Titlebar.svelte";
  import { applyTheme, DEFAULT_THEME } from "#lib/app/shell/theme.js";
  import { windowTitle } from "#lib/app/shell/window-title.svelte.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let { children }: { children: Snippet } = $props();

  // Before any page is mounted: the canvas reads its background from the theme.
  applyTheme(DEFAULT_THEME);
  // For the browser's spelling, hyphenation and screen readers.
  document.documentElement.lang = getLocale();
</script>

<!-- Until a page names itself (the editor does with the document's name). -->
<svelte:head><title>Didi</title></svelte:head>

<!-- The window has no system title bar: every page shows ours above its content, unless
     it has its own. -->
<div class="window">
  {#if !windowTitle.hidden}
    <Titlebar
      title={windowTitle.name}
      dirty={windowTitle.dirty}
      menu={windowTitle.menu}
      end={windowTitle.end}
      center={windowTitle.center}
      dimmed={windowTitle.dimmed}
    />
  {/if}
  <div class="content">{@render children()}</div>
</div>

<style>
  .window {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .content {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
