<script lang="ts">
  // The preview over the canvas (pop-in): a small panel showing the whole drawing, always
  // above the canvas. Its bar shows on hover: drag its handle to move it, and after the zoom,
  // out to a window of its own (where there can be one) and close. Drag an edge or a corner
  // to resize it.

  import { SquareArrowOutUpRight, X } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { Drawing } from "#lib/core/document/drawing.js";
  import PreviewBar from "./PreviewBar.svelte";
  import PreviewImage from "./PreviewImage.svelte";
  import { PreviewSender } from "./preview-link";
  import { m } from "#lib/paraglide/messages.js";

  let {
    drawing,
    side,
    onPopOut,
    onClose,
  }: {
    drawing: Drawing;
    /** Where it first appears: away from the panels. */
    side: "left" | "right";
    /** Null where the app cannot open windows (a browser). */
    onPopOut: (() => void) | null;
    onClose: () => void;
  } = $props();

  /** In CSS pixels, from the editor's top left corner. */
  let box = $state({ x: 0, y: 0, width: 240, height: 180 });
  const MIN_SIZE = 96;
  /** Kept inside the editor by at least this much. */
  const MARGIN = 8;

  let element: HTMLElement;
  let image = $state<PreviewImage>();

  $effect(() => {
    const view = image;
    if (!view) return;
    const sender = new PreviewSender(drawing, (message) => view.receive(message));
    return () => sender.close();
  });

  onMount(() => {
    const parent = element.offsetParent as HTMLElement | null;
    const width = parent?.clientWidth ?? innerWidth;
    const height = parent?.clientHeight ?? innerHeight;
    // Near the top corner, under the title bar and the tool's options.
    box.y = Math.round(height * 0.12);
    box.x = side === "right" ? width - box.width - 4 * MARGIN : 4 * MARGIN;
  });

  /** Follows the pointer from `down` until it is released. */
  function drag(down: PointerEvent, move: (dx: number, dy: number) => void) {
    if (down.button !== 0) return;
    down.preventDefault();
    down.stopPropagation();
    const target = down.currentTarget as HTMLElement;
    target.setPointerCapture(down.pointerId);
    const onMove = (e: PointerEvent) => move(e.clientX - down.clientX, e.clientY - down.clientY);
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function room() {
    const parent = element.offsetParent as HTMLElement | null;
    return {
      width: parent?.clientWidth ?? innerWidth,
      height: parent?.clientHeight ?? innerHeight,
    };
  }

  function onMove(down: PointerEvent) {
    const start = { ...box };
    const { width, height } = room();
    drag(down, (dx, dy) => {
      box.x = clamp(start.x + dx, MARGIN - box.width / 2, width - box.width / 2 - MARGIN);
      box.y = clamp(start.y + dy, MARGIN, height - box.height / 2);
    });
  }

  type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
  const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  /** Moves the edges named by `edge` (e.g. "nw": top and left), the others staying put. */
  function onResize(down: PointerEvent, edge: Edge) {
    const start = { ...box };
    const right = start.x + start.width;
    const bottom = start.y + start.height;
    const { width, height } = room();
    drag(down, (dx, dy) => {
      if (edge.includes("e")) {
        box.width = clamp(right + dx, start.x + MIN_SIZE, width - MARGIN) - start.x;
      } else if (edge.includes("w")) {
        box.x = clamp(start.x + dx, MARGIN, right - MIN_SIZE);
        box.width = right - box.x;
      }
      if (edge.includes("s")) {
        box.height = clamp(bottom + dy, start.y + MIN_SIZE, height - MARGIN) - start.y;
      } else if (edge.includes("n")) {
        box.y = clamp(start.y + dy, MARGIN, bottom - MIN_SIZE);
        box.height = bottom - box.y;
      }
    });
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
</script>

<div
  class="panel popin"
  role="figure"
  aria-label={m.preview_title()}
  bind:this={element}
  style:left="{box.x}px"
  style:top="{box.y}px"
  style:width="{box.width}px"
  style:height="{box.height}px"
>
  <PreviewImage bind:this={image} />
  <PreviewBar {image} onpointerdown={onMove}>
    {#snippet end()}
      {#if onPopOut}
        <button
          class="icon"
          title={m.preview_open_window()}
          aria-label={m.preview_open_window()}
          onclick={onPopOut}
        >
          <SquareArrowOutUpRight class="icon-small" />
        </button>
      {/if}
      <button class="icon" title={m.common_close()} aria-label={m.common_close()} onclick={onClose}>
        <X class="icon-small" />
      </button>
    {/snippet}
  </PreviewBar>
  <!-- Its edges and corners: drag one to resize it. -->
  {#each EDGES as edge (edge)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="edge {edge}" onpointerdown={(e) => onResize(e, edge)}></div>
  {/each}
</div>

<style>
  .popin {
    position: absolute;
    overflow: hidden;
    background: var(--canvas-bg);
  }

  /* Along the inside of the border, the corners over the edges. */
  .edge {
    position: absolute;
    --thickness: calc(var(--space) * 0.75);
    --corner: calc(var(--space) * 1.5);
  }

  .n,
  .s {
    left: 0;
    right: 0;
    height: var(--thickness);
    cursor: ns-resize;
  }

  .e,
  .w {
    top: 0;
    bottom: 0;
    width: var(--thickness);
    cursor: ew-resize;
  }

  .ne,
  .nw,
  .se,
  .sw {
    width: var(--corner);
    height: var(--corner);
  }

  .n,
  .ne,
  .nw {
    top: 0;
  }

  .s,
  .se,
  .sw {
    bottom: 0;
  }

  .e,
  .ne,
  .se {
    right: 0;
  }

  .w,
  .nw,
  .sw {
    left: 0;
  }

  .nw,
  .se {
    cursor: nwse-resize;
  }

  .ne,
  .sw {
    cursor: nesw-resize;
  }
</style>
