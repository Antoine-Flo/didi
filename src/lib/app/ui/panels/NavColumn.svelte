<script lang="ts">
  // The view's buttons, in a thin column against the window's edge away from the panels, or
  // beside them: zoom, fit, rotation, grids, then the layout menu. Its grip moves it (see
  // EdgeColumn and edge-columns.ts). The buttons run commands.

  import type { Snippet } from "svelte";
  import { Compass, Maximize, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "@lucide/svelte";
  import GridButton from "#lib/app/ui/panels/GridButton.svelte";
  import EdgeColumn from "#lib/app/ui/widgets/EdgeColumn.svelte";
  import type { TileGrid } from "#lib/core/file/didi-file.js";
  import type { Camera } from "#lib/render/camera.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    camera,
    pixelGrid,
    tileGrid,
    ontilegrid,
    side,
    top,
    element = $bindable(),
    height = $bindable(0),
    ondrop,
    ondragging,
    onreset,
    tip,
    run,
    end,
  }: {
    camera: Camera;
    /** The pixels' grid is shown (when zoomed in). */
    pixelGrid: boolean;
    /** The document's tiles' grid. */
    tileGrid: TileGrid;
    ontilegrid: (grid: TileGrid) => void;
    /** Where the popups open: towards the canvas. */
    side: "left" | "right";
    /** In pixels from the top of its edge. */
    top: number;
    element?: HTMLElement;
    height?: number;
    ondrop: (box: DOMRect) => void;
    ondragging?: (dragging: boolean) => void;
    onreset: () => void;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
    /** Last, before the grip: the layout menu. */
    end?: Snippet;
  } = $props();

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  const percent = $derived(Math.round(camera.zoom * 100));
</script>

<EdgeColumn
  {top}
  label={m.nav_column()}
  gripTitle={m.nav_column_grip_tip()}
  gripLabel={m.nav_column_grip()}
  bind:element
  bind:height
  {ondrop}
  {ondragging}
  {onreset}
>
  <button class="icon" title={tip("view.zoomIn")} onclick={() => run("view.zoomIn")}
    ><ZoomIn /></button
  >

  <!-- The zoom in percent, without "%": there is no room for it, and the column says what it
       is. The tooltip has it. -->
  <button
    class="zoom"
    title={m.nav_zoom_tip({ percent, tip: tip("view.actualSize") })}
    onclick={() => run("view.actualSize")}>{percent}</button
  >

  <button class="icon" title={tip("view.zoomOut")} onclick={() => run("view.zoomOut")}
    ><ZoomOut /></button
  >

  <button class="icon" title={tip("view.fit")} onclick={() => run("view.fit")}><Maximize /></button>

  <hr />

  <button class="icon" title={tip("view.rotateLeft")} onclick={() => run("view.rotateLeft")}
    ><RotateCcw /></button
  >

  <button class="icon" title={tip("view.rotateRight")} onclick={() => run("view.rotateRight")}
    ><RotateCw /></button
  >

  <button
    class="icon"
    title={m.nav_rotation_tip({
      tip: tip("view.resetRotation"),
      degrees: degrees(camera.rotation),
    })}
    onclick={() => run("view.resetRotation")}
  >
    <Compass />
  </button>

  <hr />

  <GridButton {side} {pixelGrid} {tileGrid} {tip} {run} {ontilegrid} />

  {#if end}
    <hr />
    {@render end()}
  {/if}
</EdgeColumn>

<style>
  /* As wide as the icons: up to "6400" in slightly smaller type. */
  .zoom {
    padding: 0;
    overflow: hidden;
    font-size: calc(var(--font-size) * 0.9);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
