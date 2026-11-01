<script lang="ts">
  // The bar below the canvas: document size, cursor position, messages, and measurements
  // (frame rate, tiles, memory).

  import { resolve } from "$app/paths";
  import type { ViewStats } from "#lib/app/canvas/CanvasView.svelte";
  import type { Editor } from "#lib/core/editor/editor.js";
  import type { Point } from "#lib/render/camera.js";

  let {
    editor,
    version,
    cursor,
    busy,
    error,
    stats,
  }: {
    editor: Editor;
    /** Changes with the document, so the memory is measured again. */
    version: number;
    /** Position on the drawing, in pixels. */
    cursor: Point | null;
    /** What is being done (saving…), if anything. */
    busy: string | null;
    error: string | null;
    stats: ViewStats | null;
  } = $props();

  /** CPU memory of layer pixels and of the history (estimate, tiles can be shared). */
  const memory = $derived.by(() => {
    void version;
    const pixels = editor.drawing.layers.reduce((sum, l) => sum + l.tiles.memoryBytes, 0);
    return { pixels, history: editor.history.bytes };
  });
  const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
</script>

<footer class="panel statusbar">
  <span>{editor.drawing.width} × {editor.drawing.height} px</span>
  <span>{cursor ? `${cursor.x}, ${cursor.y}` : ""}</span>
  {#if busy}<span>{busy}</span>{/if}
  {#if error}<span class="error">{error}</span>{/if}
  <span class="spacer"></span>
  {#if stats}
    <span title="Frames per second">{Math.round(stats.fps)} fps</span>
    <span title="Tiles on the GPU">{stats.tiles} tiles</span>
  {/if}
  <span title="Memory of the pixels / of the history (estimate)"
    >{mb(memory.pixels)} · history {mb(memory.history)}</span
  >
  <a href={resolve("lab")}>Lab</a>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    gap: calc(var(--space) * 2);
    height: 100%;
    padding: 0 var(--space);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  a {
    color: var(--text-muted);
  }

  .error {
    overflow: hidden;
    color: var(--danger);
    text-overflow: ellipsis;
  }
</style>
