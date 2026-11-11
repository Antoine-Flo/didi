<script lang="ts">
  import type { Snippet } from "svelte";
  import Titlebar from "#lib/app/ui/shell/Titlebar.svelte";
  import { applyTheme } from "#lib/app/prefs/theme.js";
  import { themePrefs } from "#lib/app/prefs/theme-prefs.svelte.js";
  import { windowTitle } from "#lib/app/layout/window-title.svelte.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let { children }: { children: Snippet } = $props();

  // Before any page is mounted: the canvas reads its background from the theme. Then again
  // with the saved choices, and whenever they change.
  applyTheme(themePrefs.theme);
  void themePrefs.load();
  $effect(() => applyTheme(themePrefs.theme));
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
      dimLayers={windowTitle.dimLayers}
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
