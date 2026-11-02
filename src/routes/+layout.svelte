<script lang="ts">
  import type { Snippet } from "svelte";
  import Titlebar from "#lib/app/shell/Titlebar.svelte";
  import { applyTheme, DEFAULT_THEME } from "#lib/app/shell/theme.js";
  import { windowTitle } from "#lib/app/shell/window-title.svelte.js";

  let { children }: { children: Snippet } = $props();

  // Before any page is mounted: the canvas reads its background from the theme.
  applyTheme(DEFAULT_THEME);
</script>

<!-- The window has no system title bar: every page shows ours above its content. -->
<div class="window">
  <Titlebar
    title={windowTitle.name}
    dirty={windowTitle.dirty}
    menu={windowTitle.menu}
    end={windowTitle.end}
    dimmed={windowTitle.dimmed}
  />
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
