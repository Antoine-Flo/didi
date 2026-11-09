<script lang="ts">
  // A thin floating column of buttons against an edge (the tools, the view's buttons), with a
  // grip at the bottom. Dragged by it, the column follows the pointer anywhere; dropped, it
  // tells where it is, for the page to put it against the nearest side (see edge-columns.ts).
  // The arrow keys move it too: up and down along its edge, left and right to a side. A
  // double-click puts it back where it starts.

  import type { Snippet } from "svelte";
  import { GripHorizontal } from "@lucide/svelte";

  let {
    top,
    label,
    gripTitle,
    gripLabel,
    element = $bindable(),
    height = $bindable(0),
    ondrop,
    ondragging,
    onreset,
    children,
  }: {
    /** In pixels from the top of where it can go. */
    top: number;
    label?: string;
    gripTitle: string;
    gripLabel: string;
    element?: HTMLElement;
    height?: number;
    /** Where the column was dropped, on the screen. */
    ondrop: (box: DOMRect) => void;
    /** Being dragged, or no longer. */
    ondragging?: (dragging: boolean) => void;
    onreset: () => void;
    children: Snippet;
  } = $props();

  const KEY_STEP = 16;

  let drag = $state<{ pointer: number; x: number; y: number; dx: number; dy: number } | null>(null);

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    ondragging?.(true);
  }

  function onpointermove(e: PointerEvent) {
    if (drag?.pointer === e.pointerId) {
      drag.dx = e.clientX - drag.x;
      drag.dy = e.clientY - drag.y;
    }
  }

  function end(e: PointerEvent) {
    if (drag?.pointer !== e.pointerId) {
      return;
    }
    // Where it is now, moved by the drag.
    const box = element!.getBoundingClientRect();
    drag = null;
    ondragging?.(false);
    ondrop(box);
  }

  function onkeydown(e: KeyboardEvent) {
    const box = element!.getBoundingClientRect();
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const dy = e.key === "ArrowDown" ? KEY_STEP : -KEY_STEP;
      ondrop(new DOMRect(box.x, box.y + dy, box.width, box.height));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const x = e.key === "ArrowLeft" ? 0 : innerWidth - box.width;
      ondrop(new DOMRect(x, box.y, box.width, box.height));
    } else {
      return;
    }
    e.preventDefault();
  }
</script>

<aside
  class="panel edge-column"
  class:dragging={drag !== null}
  aria-label={label}
  style:top="{top}px"
  style:translate={drag ? `${drag.dx}px ${drag.dy}px` : undefined}
  bind:this={element}
  bind:clientHeight={height}
>
  {@render children()}

  <button
    class="grip"
    title={gripTitle}
    aria-label={gripLabel}
    {onpointerdown}
    {onpointermove}
    onpointerup={end}
    onpointercancel={end}
    ondblclick={onreset}
    {onkeydown}
  >
    <GripHorizontal class="icon-small" />
  </button>
</aside>

<style>
  /* As wide as its track: one button. */
  .edge-column {
    position: absolute;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: calc(var(--space) / 2);
    pointer-events: auto;
  }

  .dragging {
    z-index: 1;
  }

  .edge-column :global(hr) {
    flex: none;
    width: 100%;
    height: 1px;
    margin: calc(var(--space) / 2) 0;
    background: var(--border);
    border: none;
  }

  /* Smaller than a button of the column, and quieter. */
  .grip {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(var(--control-height) / 2 + 2px);
    padding: 0;
    color: var(--text-faint);
    touch-action: none;
    cursor: grab;
  }

  .grip:hover {
    color: var(--text-muted);
  }

  .grip:active {
    cursor: grabbing;
  }
</style>
