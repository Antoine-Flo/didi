<script lang="ts">
  // The bar below the canvas: the document's mode and messages on the left, the view (zoom,
  // rotation) in the middle, the cursor position and the document's size on the right. The
  // buttons run commands.

  import { Compass, Maximize, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "@lucide/svelte";
  import ModeSwitch from "#lib/app/panels/ModeSwitch.svelte";
  import type { Mode } from "#lib/app/modes/mode.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import type { Camera, Point } from "#lib/render/camera.js";

  let {
    editor,
    modes,
    mode,
    cursor,
    busy,
    error,
    camera,
    tip,
    run,
  }: {
    editor: Editor;
    modes: Mode[];
    /** Id of the document's mode. */
    mode: string;
    /** Position on the drawing, in pixels. */
    cursor: Point | null;
    /** What is being done (saving…), if anything. */
    busy: string | null;
    error: string | null;
    camera: Camera;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
</script>

<footer class="panel statusbar">
  <div class="status-start">
    <ModeSwitch {modes} {mode} {tip} {run} />
    {#if busy}<span>{busy}</span>{/if}
    {#if error}<span class="error">{error}</span>{/if}
  </div>

  <div class="view">
    <button class="icon" title={tip("view.zoomOut")} onclick={() => run("view.zoomOut")}
      ><ZoomOut /></button
    >

    <button class="zoom" title={tip("view.actualSize")} onclick={() => run("view.actualSize")}
      >{Math.round(camera.zoom * 100)}%</button
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
      title="{tip('view.resetRotation')} · {degrees(camera.rotation)}°"
      onclick={() => run("view.resetRotation")}
    >
      <Compass />
    </button>
  </div>

  <div class="status-end">
    <span class="cursor">{cursor ? `${cursor.x}, ${cursor.y}` : ""}</span>
    <span>{editor.drawing.width} × {editor.drawing.height} px</span>
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
