<script lang="ts" module>
  import { CullerPlugin, extensions } from "pixi.js";

  // Skips off-screen tiles when rendering.
  extensions.add(CullerPlugin);

  export interface ViewStats {
    fps: number;
    /** Tile sprites on the GPU. */
    tiles: number;
  }

  /** Brush outline under the cursor, in canvas pixels. */
  export type BrushCursor = { kind: "circle" | "square"; size: number } | { kind: "none" };
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { Application } from "pixi.js";
  import { consumeDismissal, markDismissal } from "$lib/app/dismissal";
  import { isTyping } from "$lib/app/keyboard";
  import type { Painter, Sample } from "$lib/app/painter";
  import type { Editor } from "$lib/core/editor";
  import { nativePenAvailable, subscribeNativePen, type PenEvent } from "$lib/platform/pen";
  import {
    fit,
    pan,
    rotateAt,
    setRotationAt,
    toCanvas,
    zoomAt,
    type Camera,
    type Point,
  } from "$lib/render/camera";
  import { DrawingView } from "$lib/render/drawing-view";

  let {
    editor,
    painter,
    brushCursor,
    oncamera,
    oncursor,
    onstats,
  }: {
    editor: Editor;
    painter?: Painter;
    /** Current brush outline, read on every pointer move. `eraser`: the pen's eraser is used. */
    brushCursor?: (eraser: boolean) => BrushCursor;
    oncamera?: (camera: Camera) => void;
    oncursor?: (point: Point | null) => void;
    /** Called twice a second with rendering statistics. */
    onstats?: (stats: ViewStats) => void;
  } = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let app: Application | null = null;
  let view: DrawingView | null = null;
  let camera: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };

  let spaceDown = $state(false);
  let panning: { id: number; x: number; y: number } | null = $state(null);
  /** Native pen events draw (Linux): DOM pointer events then only pan the view. */
  let nativeInput = false;
  let stroking = false;
  /** The pen's eraser end is near the tablet (hovering), or was used to start the stroke. */
  let hoverEraser = false;
  let strokeEraser = false;
  /** Last cursor position, in canvas pixels, to redraw the outline when the pen flips. */
  let lastCursor: Point | null = null;
  let destroyed = false;
  /** Pending end of a native stroke, see `onNative`. */
  let pendingEnd: ReturnType<typeof setTimeout> | null = null;
  /**
   * Some drivers switch the pen to its eraser (or back) with a barrel button: the system
   * then sees the pen lifted and the eraser put down at once. Within this delay, a lift
   * followed by a new contact is treated as the same stroke.
   */
  const DEVICE_SWITCH_MS = 50;

  function setCamera(next: Camera) {
    camera = next;
    view?.setCamera(next, { width: host.clientWidth, height: host.clientHeight });
    oncamera?.(next);
  }

  function center(): Point {
    return { x: host.clientWidth / 2, y: host.clientHeight / 2 };
  }

  export function fitView() {
    setCamera(fit(editor.drawing, { width: host.clientWidth, height: host.clientHeight }));
  }

  export function zoomBy(factor: number) {
    setCamera(zoomAt(camera, center(), factor));
  }

  /** Sets the zoom to an absolute value, around the center of the view. */
  export function zoomTo(zoom: number) {
    zoomBy(zoom / camera.zoom);
  }

  export function rotateBy(angle: number) {
    setCamera(rotateAt(camera, center(), angle));
  }

  export function resetRotation() {
    setCamera(setRotationAt(camera, center(), 0));
  }

  function local(e: { clientX: number; clientY: number }): Point {
    const rect = host.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 40 : e.deltaY;
    if (e.shiftKey) {
      setCamera(rotateAt(camera, local(e), (Math.sign(delta) * Math.PI) / 12));
    } else {
      setCamera(zoomAt(camera, local(e), Math.exp(-delta * 0.0015)));
    }
  }

  /** A drawing sample from a point in view coordinates. */
  function sample(
    p: Point,
    pressure: number,
    extra: { tiltX?: number; tiltY?: number; time?: number } = {},
  ): Sample {
    return {
      ...toCanvas(camera, p),
      pressure,
      viewZoom: camera.zoom,
      viewRotation: (camera.rotation * 180) / Math.PI,
      ...extra,
    };
  }

  function domSample(e: PointerEvent): Sample {
    return sample(local(e), domPressure(e), { tiltX: e.tiltX, tiltY: e.tiltY, time: e.timeStamp });
  }

  // DOM pointer events: panning everywhere, drawing when there is no native input.

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      if (!nativeInput) consumeDismissal();
      host.setPointerCapture(e.pointerId);
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      updateCursor(null);
      return;
    }
    // Button 5 is the pen's eraser end.
    if (nativeInput || !painter || (e.button !== 0 && e.button !== 5)) return;
    if (consumeDismissal()) return;
    host.setPointerCapture(e.pointerId);
    const eraser = e.button === 5 || (e.buttons & 32) !== 0;
    stroking = painter.begin(domSample(e), eraser);
    strokeEraser = eraser;
  }

  function onPointerMove(e: PointerEvent) {
    if (panning?.id === e.pointerId) {
      setCamera(pan(camera, e.clientX - panning.x, e.clientY - panning.y));
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (stroking && !nativeInput) {
      const events = e.getCoalescedEvents?.() ?? [];
      painter?.move((events.length ? events : [e]).map(domSample));
    }
    const p = toCanvas(camera, local(e));
    oncursor?.({ x: Math.floor(p.x), y: Math.floor(p.y) });
    updateCursor(panning ? null : p);
  }

  function onPointerUp(e: PointerEvent) {
    if (panning?.id === e.pointerId) panning = null;
    if (stroking && !nativeInput) {
      painter?.end();
      stroking = false;
    }
  }

  /** Mice report 0.5 while pressed: they draw at full pressure. */
  function domPressure(e: PointerEvent): number {
    return e.pointerType === "pen" || e.pointerType === "touch" ? e.pressure : 1;
  }

  // Native pen events (Linux): positions are relative to the webview.

  function onNative(e: PenEvent) {
    if (destroyed || !painter) return;
    const rect = host.getBoundingClientRect();
    const p = { x: e.x - rect.left, y: e.y - rect.top };
    const pen = e.source === "pen" || e.source === "eraser";
    const pressure = pen ? e.pressure : 1;
    const extra = { tiltX: e.tiltX, tiltY: e.tiltY, time: e.time };
    if (pen && (e.source === "eraser") !== hoverEraser) {
      hoverEraser = e.source === "eraser";
      updateCursor(lastCursor);
    }
    if (e.phase === "move") {
      if (!stroking) return;
      if (!e.pressed && pendingEnd === null) {
        // The tip is up but we missed its release (e.g. it happened in another window,
        // like the color dialog): end the stroke instead of drawing while hovering.
        endStroke();
        return;
      }
      painter.move([sample(p, pressure, extra)]);
      return;
    }
    if (e.button !== 1) return;
    if (e.phase === "down") {
      if (pendingEnd !== null) {
        // The pen switched device (pen ↔ eraser) without being lifted: same stroke,
        // same tool until the pen is really lifted.
        clearTimeout(pendingEnd);
        pendingEnd = null;
        return;
      }
      // Without focus, a contact belongs to another window (e.g. the color dialog).
      if (!document.hasFocus()) return;
      // A click that closes a dialog or menu only closes it (see dismissal.ts).
      if (consumeDismissal()) return;
      // Only start on the canvas itself, not over a panel or while panning.
      const target = document.elementFromPoint(e.x, e.y);
      if (spaceDown || panning || !target || !host.contains(target)) return;
      strokeEraser = e.source === "eraser";
      stroking = painter.begin(sample(p, pressure, extra), strokeEraser);
    } else if (stroking && pendingEnd === null) {
      // Wait a little: a "down" right after means a device switch, not a lift.
      pendingEnd = setTimeout(endStroke, DEVICE_SWITCH_MS);
    }
  }

  function endStroke() {
    if (pendingEnd !== null) clearTimeout(pendingEnd);
    pendingEnd = null;
    if (stroking) painter?.end();
    stroking = false;
    updateCursor(lastCursor);
  }

  function updateCursor(p: Point | null) {
    lastCursor = p;
    const eraser = stroking ? strokeEraser : hoverEraser;
    view?.setBrushCursor(p && brushCursor ? { ...brushCursor(eraser), x: p.x, y: p.y } : null);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === "Space" && !isTyping(e)) {
      spaceDown = true;
      e.preventDefault();
    }
    if (e.key === "Escape" && stroking) {
      if (pendingEnd !== null) clearTimeout(pendingEnd);
      pendingEnd = null;
      painter?.cancel();
      stroking = false;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === "Space") spaceDown = false;
  }

  onMount(() => {
    const pixi = new Application();
    pixi
      .init({
        canvas,
        resizeTo: host,
        preference: "webgl",
        antialias: false,
        background: 0x2b2b2b,
        resolution: devicePixelRatio,
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) return pixi.destroy();
        app = pixi;
        view = new DrawingView(editor.drawing);
        pixi.stage.addChild(view.root);
        fitView();
        let elapsed = 0;
        pixi.ticker.add((ticker) => {
          painter?.flush();
          view?.flush();
          elapsed += ticker.deltaMS;
          if (elapsed >= 500 && view) {
            onstats?.({ fps: ticker.FPS, tiles: view.tileCount });
            elapsed = 0;
          }
        });
      });

    nativePenAvailable().then((available) => {
      if (!available || destroyed) return;
      nativeInput = true;
      subscribeNativePen(onNative);
    });

    // When the window loses focus (e.g. to the color dialog), end any stroke (the dialog
    // may swallow the release), and make the click that comes back a dismissal click.
    const onBlur = () => {
      endStroke();
      markDismissal();
    };
    window.addEventListener("blur", onBlur);
    // A first contact outside the canvas (on the interface) works normally and clears it.
    const onAnyPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !host.contains(e.target)) consumeDismissal();
    };
    window.addEventListener("pointerdown", onAnyPointerDown, true);

    // Keep the checkerboard and the grid matching the view size.
    const resize = new ResizeObserver(() => setCamera(camera));
    resize.observe(host);

    return () => {
      destroyed = true;
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onAnyPointerDown, true);
      endStroke();
      resize.disconnect();
      view?.destroy();
      app?.destroy();
    };
  });
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div
  class="host"
  class:grab={spaceDown}
  class:grabbing={panning}
  bind:this={host}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onpointerleave={() => {
    oncursor?.(null);
    updateCursor(null);
  }}
  oncontextmenu={(e) => e.preventDefault()}
  role="application"
>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .host {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    touch-action: none;
    cursor: crosshair;
  }

  .grab {
    cursor: grab;
  }

  .grabbing {
    cursor: grabbing;
  }

  canvas {
    display: block;
  }
</style>
