<script lang="ts">
  // The preview's bar: a handle to move it (pop-in) or its window (pop-out), the zoom and
  // fit, and the buttons after. Over the top of the image, shown while the pointer is on the
  // preview; or fixed, above the image (pop-out).

  import { GripHorizontal, Maximize, ZoomIn, ZoomOut } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import type PreviewImage from "#lib/app/ui/preview/PreviewImage.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    image,
    fixed = false,
    onpointerdown,
    onmousedown,
    end,
  }: {
    image: PreviewImage | undefined;
    /** Always shown, in the layout: the image goes below it. */
    fixed?: boolean;
    /** Pressed on the handle: start moving (pop-in). */
    onpointerdown?: (e: PointerEvent) => void;
    /** The same as a mouse event, which counts clicks (pop-out: a double-click maximizes). */
    onmousedown?: (e: MouseEvent) => void;
    /** After the zoom, e.g. the window's buttons. */
    end: Snippet;
  } = $props();
</script>

<div class="preview-bar" class:fixed>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="handle" title={m.preview_move()} {onpointerdown} {onmousedown}>
    <GripHorizontal class="icon-small" />
  </div>
  <button
    class="icon"
    title={m.preview_zoom_out()}
    aria-label={m.preview_zoom_out()}
    disabled={!image?.canZoomOut()}
    onclick={() => image?.zoomOut()}
  >
    <ZoomOut class="icon-small" />
  </button>
  <button
    class="icon"
    title={m.preview_zoom_in()}
    aria-label={m.preview_zoom_in()}
    disabled={!image?.canZoomIn()}
    onclick={() => image?.zoomIn()}
  >
    <ZoomIn class="icon-small" />
  </button>
  <button
    class="icon"
    title={m.preview_fit()}
    aria-label={m.preview_fit()}
    disabled={image?.isFitted() ?? true}
    onclick={() => image?.fitView()}
  >
    <Maximize class="icon-small" />
  </button>
  {@render end()}
</div>

<style>
  .preview-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 2px;
    align-items: center;
    padding: 2px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    opacity: 0;
    transition: opacity 0.15s;
  }

  /* While the pointer is on the preview; always where nothing hovers (touch). */
  :global(:hover) > .preview-bar,
  .preview-bar:focus-within {
    opacity: 1;
  }

  .fixed {
    position: static;
    flex: none;
    opacity: 1;
  }

  @media (hover: none) {
    .preview-bar {
      opacity: 1;
    }
  }

  .handle {
    display: flex;
    flex: 1;
    align-self: stretch;
    align-items: center;
    padding-left: calc(var(--space) / 2);
    color: var(--text-faint);
    cursor: move;
  }

  .handle:hover {
    color: var(--text-muted);
  }
</style>
