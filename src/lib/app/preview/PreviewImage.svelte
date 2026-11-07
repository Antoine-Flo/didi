<script lang="ts">
  // The previewed drawing, over the canvas's checkerboard where it is transparent. Fitted to
  // the room it has, until zoomed: the wheel zooms around the pointer, dragging (or the
  // middle button) pans, a double-click fits it again. Above 100 %, zoomed by whole steps
  // with square pixels, so that pixel art stays sharp. Shows what it receives (see
  // preview-link).

  import { onMount, untrack } from "svelte";
  import type { ToPreview } from "./preview-link";

  const MAX_ZOOM = 64;
  /** Out down to this part of the fitted size: room around it, e.g. out of the bar's way. */
  const MIN_OF_FIT = 1 / 4;
  /** Below 100 %, each step zooms by this factor. */
  const STEP = 1.25;
  /** Wheel distance, in pixels, for one step. */
  const WHEEL_STEP = 50;

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null = null;
  let image = $state({ width: 0, height: 0 });
  let room = $state({ width: 0, height: 0 });
  /** Device pixels per drawing pixel, or null to fit. */
  let zoom = $state<number | null>(null);
  /** The drawing's point at the middle of the room, in drawing pixels, when zoomed. */
  let center = $state({ x: 0, y: 0 });
  let panning = $state(false);
  let wheel = 0;

  const ratio = devicePixelRatio;

  /** Fitted: by whole steps above 100 %. */
  const fit = $derived.by(() => {
    if (!image.width || !image.height || !room.width || !room.height) return 0;
    const scale = Math.min(room.width / image.width, room.height / image.height) * ratio;
    return scale >= 1 ? Math.floor(scale) : scale;
  });
  const scale = $derived(zoom ?? fit);
  const middle = $derived(zoom === null ? { x: image.width / 2, y: image.height / 2 } : center);

  /** Where the drawing is shown, in CSS pixels, on whole device pixels to stay sharp. */
  const shown = $derived.by(() => {
    if (!scale) return null;
    const snap = (v: number) => Math.round(v * ratio) / ratio;
    return {
      left: snap(room.width / 2 - (middle.x * scale) / ratio),
      top: snap(room.height / 2 - (middle.y * scale) / ratio),
      width: (image.width * scale) / ratio,
      height: (image.height * scale) / ratio,
    };
  });

  onMount(() => {
    context = canvas.getContext("2d");
  });

  /** Untracked: called from the sender, maybe inside the caller's effect, which must not
   *  depend on the image's state that this changes. */
  export function receive(message: ToPreview) {
    untrack(() => show(message));
  }

  function show(message: ToPreview) {
    if (message.type === "size") {
      // Another drawing: all of it again.
      if (message.width !== image.width || message.height !== image.height) zoom = null;
      canvas.width = message.width;
      canvas.height = message.height;
      image = { width: message.width, height: message.height };
      return;
    }
    const { rect, data } = message;
    const pixels = new ImageData(data as Uint8ClampedArray<ArrayBuffer>, rect.width, rect.height);
    (context ??= canvas.getContext("2d"))?.putImageData(pixels, rect.x, rect.y);
  }

  export const canZoomIn = () => scale > 0 && scale < MAX_ZOOM;
  export const canZoomOut = () => scale > fit * MIN_OF_FIT;
  export const isFitted = () => zoom === null;
  /** Fitted to the room again, and kept fitted when the room changes. */
  export const fitView = () => (zoom = null);
  export const zoomIn = () => zoomBy(1);
  export const zoomOut = () => zoomBy(-1);

  /** One step in or out, keeping the drawing's point at `at` (CSS pixels in the room). */
  function zoomBy(direction: 1 | -1, at = { x: room.width / 2, y: room.height / 2 }) {
    if (direction > 0 ? !canZoomIn() : !canZoomOut()) return;
    const from = scale;
    let to: number;
    if (direction > 0) to = from < 1 ? Math.min(1, from * STEP) : Math.floor(from) + 1;
    else to = from > 1 ? Math.ceil(from) - 1 : from / STEP;
    const offset = { x: (at.x - room.width / 2) * ratio, y: (at.y - room.height / 2) * ratio };
    const point = { x: middle.x + offset.x / from, y: middle.y + offset.y / from };
    center = clampCenter({ x: point.x - offset.x / to, y: point.y - offset.y / to });
    zoom = Math.max(fit * MIN_OF_FIT, Math.min(MAX_ZOOM, to));
  }

  /** The drawing stays at least half in view. */
  function clampCenter(p: { x: number; y: number }) {
    return {
      x: Math.max(0, Math.min(image.width, p.x)),
      y: Math.max(0, Math.min(image.height, p.y)),
    };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * WHEEL_STEP : e.deltaY;
    if (Math.sign(delta) !== Math.sign(wheel)) wheel = 0;
    wheel += delta;
    if (Math.abs(wheel) < WHEEL_STEP) return;
    wheel = 0;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomBy(delta < 0 ? 1 : -1, { x: e.clientX - box.left, y: e.clientY - box.top });
  }

  function onPointerDown(down: PointerEvent) {
    if (zoom === null || (down.button !== 0 && down.button !== 1)) return;
    down.preventDefault();
    const target = down.currentTarget as HTMLElement;
    target.setPointerCapture(down.pointerId);
    const start = center;
    const pan = zoom / ratio;
    panning = true;
    const onMove = (e: PointerEvent) => {
      center = clampCenter({
        x: start.x - (e.clientX - down.clientX) / pan,
        y: start.y - (e.clientY - down.clientY) / pan,
      });
    };
    const onUp = () => {
      panning = false;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="room"
  class:zoomed={zoom !== null}
  class:panning
  bind:clientWidth={room.width}
  bind:clientHeight={room.height}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  ondblclick={fitView}
>
  <canvas
    bind:this={canvas}
    class:pixelated={scale >= 1}
    style:left="{shown?.left ?? 0}px"
    style:top="{shown?.top ?? 0}px"
    style:width="{shown?.width ?? 0}px"
    style:height="{shown?.height ?? 0}px"
  ></canvas>
</div>

<style>
  .room {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
  }

  .zoomed {
    cursor: grab;
  }

  .panning {
    cursor: grabbing;
  }

  /* The same checkerboard as the canvas. */
  canvas {
    position: absolute;
    background: repeating-conic-gradient(#f2f2f2 0 25%, #cfcfcf 0 50%) 0 0 / 32px 32px;
  }

  canvas.pixelated {
    image-rendering: pixelated;
  }
</style>
