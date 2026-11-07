<script lang="ts">
  // The preview of a layer in the layers panel: its content, framed to fit, over a
  // checkerboard where it is transparent. Redrawn when `stamp` changes.

  import type { ReadonlyTileStore } from "#lib/core/document/layer.js";
  import { contentBounds, layerThumbnail } from "#lib/core/document/layer-thumbnail.js";

  let { tiles, stamp }: { tiles: ReadonlyTileStore; stamp: number } = $props();

  /** Preview size, in pixels: about twice the shown size, to stay sharp on HiDPI screens. */
  const SIZE = 48;

  let canvas: HTMLCanvasElement;
  /** Small content (pixel art) is enlarged with square pixels. */
  let pixelated = $state(false);
  let empty = $state(true);

  $effect(() => {
    void stamp;
    const bounds = contentBounds(tiles);
    empty = bounds === null;
    if (!bounds) return;
    pixelated = Math.max(bounds.width, bounds.height) <= SIZE;
    const thumb = layerThumbnail(tiles, SIZE, bounds);
    canvas.width = thumb.width;
    canvas.height = thumb.height;
    const context = canvas.getContext("2d");
    context?.putImageData(
      new ImageData(thumb.data as Uint8ClampedArray<ArrayBuffer>, thumb.width, thumb.height),
      0,
      0,
    );
  });
</script>

<span class="thumb"><canvas bind:this={canvas} class:pixelated class:empty></canvas></span>

<style>
  .thumb {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: calc(var(--control-height) - 2px);
    height: calc(var(--control-height) - 2px);
    margin: 0 calc(var(--space) / 2);
    overflow: hidden;
    /* A checkerboard, seen through the transparent parts. */
    background: repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 6px
      6px;
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }

  canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  canvas.pixelated {
    image-rendering: pixelated;
  }

  canvas.empty {
    visibility: hidden;
  }
</style>
