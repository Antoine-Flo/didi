<script lang="ts">
  // The bar below the canvas: the shortcuts' button and messages on the left, the view (zoom,
  // rotation, pixels' grid) in the middle, the cursor position and the document's size on the right. The
  // buttons run commands.

  import {
    Compass,
    Grid3x3,
    Keyboard,
    Maximize,
    RotateCcw,
    RotateCw,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import type { Editor } from "#lib/core/editor/editor.js";
  import type { Camera, Point } from "#lib/render/camera.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    editor,
    cursor,
    busy,
    error,
    camera,
    pixelGrid,
    tip,
    run,
    onShortcuts,
  }: {
    editor: Editor;
    /** Position on the drawing, in pixels. */
    cursor: Point | null;
    /** What is being done (saving…), if anything. */
    busy: string | null;
    error: string | null;
    camera: Camera;
    /** The pixels' grid is shown (when zoomed in). */
    pixelGrid: boolean;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
    /** Opens the list of keyboard shortcuts. */
    onShortcuts: () => void;
  } = $props();

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
</script>

<footer class="panel statusbar">
  <div class="status-start">
    <button class="icon" title={m.status_shortcuts()} onclick={onShortcuts}><Keyboard /></button>
    {#if busy}<span>{busy}</span>{/if}
    {#if error}<span class="error">{error}</span>{/if}
  </div>

  <div class="view">
    <button class="icon" title={tip("view.zoomOut")} onclick={() => run("view.zoomOut")}
      ><ZoomOut /></button
    >

    <button class="zoom" title={tip("view.actualSize")} onclick={() => run("view.actualSize")}
      >{m.toolbar_percent({ percent: Math.round(camera.zoom * 100) })}</button
    >

    <button class="icon" title={tip("view.zoomIn")} onclick={() => run("view.zoomIn")}
      ><ZoomIn /></button
    >

    <button class="icon" title={tip("view.fit")} onclick={() => run("view.fit")}
      ><Maximize /></button
    >

    <button class="icon" title={tip("view.rotateLeft")} onclick={() => run("view.rotateLeft")}
      ><RotateCcw /></button
    >

    <button class="icon" title={tip("view.rotateRight")} onclick={() => run("view.rotateRight")}
      ><RotateCw /></button
    >

    <button
      class="icon"
      title={m.status_rotation_tip({
        tip: tip("view.resetRotation"),
        degrees: degrees(camera.rotation),
      })}
      onclick={() => run("view.resetRotation")}
    >
      <Compass />
    </button>

    <button
      class="icon"
      class:active={pixelGrid}
      class:off={!pixelGrid}
      title={tip("view.pixelGrid")}
      onclick={() => run("view.pixelGrid")}
    >
      <Grid3x3 />
    </button>
  </div>

  <div class="status-end">
    <span class="cursor">{cursor ? m.status_cursor({ x: cursor.x, y: cursor.y }) : ""}</span>
    <span
      >{m.status_document_size({
        width: editor.drawing.width,
        height: editor.drawing.height,
      })}</span
    >
  </div>
</footer>

<style>
  /* Three columns: the middle one stays centered whatever the sides hold. */
  .statusbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: calc(var(--space) * 2);
    height: 100%;
    padding: 0 calc(var(--space) / 2);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .status-start,
  .status-end,
  .view {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .status-start,
  .status-end {
    gap: calc(var(--space) * 2);
  }

  .status-end {
    justify-content: flex-end;
    padding-right: calc(var(--space) / 2);
  }

  .view {
    color: var(--text);
  }

  /* A switch that is off, like the layers' locks. */
  .view .off {
    color: var(--text-faint);
  }

  .zoom {
    width: var(--percent-width);
    padding: 0;
  }

  /* Room for the position, so that the next items do not move. */
  .cursor {
    min-width: 10ch;
    text-align: right;
  }

  .error {
    overflow: hidden;
    color: var(--danger);
    text-overflow: ellipsis;
  }
</style>
