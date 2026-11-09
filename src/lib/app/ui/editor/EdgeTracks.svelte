<script lang="ts">
  // The thin columns, the tools and the view's buttons: beside the panels' column, on the
  // canvas side, or against the window's other edge. Moved by their grip.
  import type { Snippet } from "svelte";
  import type { EditorLayout } from "#lib/app/layout/editor-layout.svelte.js";
  import type { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
  import type { Tool, ToolSettings } from "#lib/app/tools/tool.js";
  import NavColumn from "#lib/app/ui/panels/NavColumn.svelte";
  import ToolColumn from "#lib/app/ui/panels/ToolColumn.svelte";
  import type { TileGrid } from "#lib/core/file/didi-file.js";
  import type { Camera } from "#lib/render/camera.js";

  let {
    layout,
    prefs,
    hidden,
    tools,
    active,
    settings,
    camera,
    pixelGrid,
    tileGrid,
    ontilegrid,
    tip,
    run,
    menu,
  }: {
    layout: EditorLayout;
    prefs: LayoutPrefs;
    /** Only the canvas shows. */
    hidden: boolean;
    tools: Tool[];
    /** Id of the tool shown active. */
    active: string;
    settings: Record<string, ToolSettings>;
    camera: Camera;
    pixelGrid: boolean;
    tileGrid: TileGrid;
    ontilegrid: (grid: TileGrid) => void;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
    /** The layout menu, at the end of the view's column, its popup opening towards `side`. */
    menu: Snippet<["left" | "right"]>;
  } = $props();
</script>

{#each ["panels", "opposite"] as const as edge (edge)}
  <div
    class="track {edge}"
    class:left={layout.panelsOnLeft}
    class:compact={layout.compact}
    class:sliding={layout.sliding}
    class:hidden
    class:dragged-from={layout.draggedFrom === edge}
    bind:this={layout.elements.tracks[edge]}
    bind:clientHeight={layout.trackHeights[edge]}
    bind:clientWidth={layout.trackWidth}
  >
    {#if layout.toolsEdge === edge}
      <ToolColumn
        {tools}
        {active}
        {settings}
        side={layout.popupSide(edge)}
        room={layout.toolsRoom}
        compact={layout.compact}
        top={layout.columnTop.tools}
        bind:element={layout.elements.toolColumn}
        bind:height={layout.toolsHeight}
        ondrop={(box) => layout.dropColumn("tools", box)}
        ondragging={(on) => (layout.draggedFrom = on ? edge : null)}
        onreset={() => prefs.resetColumn("tools")}
        {tip}
        {run}
      />
    {/if}
    {#if layout.navShown && layout.navEdge === edge}
      <NavColumn
        {camera}
        {pixelGrid}
        {tileGrid}
        {ontilegrid}
        side={layout.popupSide(edge)}
        top={layout.columnTop.nav}
        bind:element={layout.elements.navColumn}
        bind:height={layout.navHeight}
        ondrop={(box) => layout.dropColumn("nav", box)}
        ondragging={(on) => (layout.draggedFrom = on ? edge : null)}
        onreset={() => prefs.resetColumn("nav")}
        {tip}
        {run}
      >
        {#snippet end()}
          {@render menu(layout.popupSide(edge))}
        {/snippet}
      </NavColumn>
    {/if}
  </div>
{/each}

<style>
  /* Where the thin columns can go. Clicks go through to the canvas, except on a column.
     Beside the panels' column, past the width handle, below the panels' tab (and when
     compact, above undo and redo). */
  .track {
    position: absolute;
    z-index: 1;
    width: var(--tool-column-width);
    pointer-events: none;
  }

  /* A column being dragged passes over everything else. */
  .track.dragged-from {
    z-index: 2;
  }

  .track.panels {
    top: calc(var(--content-top) + var(--tabs-height) + var(--space));
    bottom: var(--space);
    right: calc(var(--column-space) + var(--space));
  }

  .left.panels {
    right: auto;
    left: calc(var(--column-space) + var(--space));
  }

  .compact.panels {
    bottom: calc(var(--bar-height) + 2 * var(--space));
  }

  /* Against the window's other edge, above the document's information. */
  .track.opposite {
    top: var(--content-top);
    bottom: calc(var(--bar-height) + 2 * var(--space));
    left: var(--space);
  }

  .left.opposite {
    left: auto;
    right: var(--space);
  }

  .compact.opposite {
    bottom: var(--space);
  }

  /* Only the canvas (Tab). */
  .hidden {
    visibility: hidden;
  }

  /* Opening or closing: the column beside the panels follows them. */
  .sliding.panels {
    transition:
      transform 0.2s ease,
      visibility 0.2s,
      left 0.2s ease,
      right 0.2s ease;
  }
</style>
