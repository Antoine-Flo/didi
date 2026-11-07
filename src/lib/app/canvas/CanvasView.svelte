<script lang="ts" module>
  import { CullerPlugin, extensions } from "pixi.js";

  // Skips off-screen tiles when rendering.
  extensions.add(CullerPlugin);

  export interface ViewStats {
    fps: number;
    /** Tile sprites on the GPU. */
    tiles: number;
  }

  /** Space taken by panels over the view, in pixels, on each side. */
  export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Application } from "pixi.js";
  import { consumeDismissal } from "#lib/app/canvas/dismissal.js";
  import { held } from "#lib/app/canvas/modifiers.svelte.js";
  import { isTyping } from "#lib/app/commands/keyboard.js";
  import type { Painter } from "#lib/app/canvas/painter.js";
  import type { BrushCursor, Sample } from "#lib/app/tools/tool.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { PenInput } from "#lib/app/canvas/pen-input.svelte.js";
  import { nativePenAvailable, subscribeNativePen, type PenEvent } from "#lib/platform/pen.js";
  import {
    fit,
    pan,
    rotateAt,
    setRotationAt,
    toCanvas,
    zoomAt,
    type Camera,
    type Point,
  } from "#lib/render/camera.js";
  import { placementOf, selectionOutline } from "#lib/core/selection/selection.js";
  import { shapeMask } from "#lib/core/selection/shape.js";
  import { DrawingView } from "#lib/render/drawing-view.js";

  let {
    editor,
    painter,
    brushCursor,
    hoverCursor,
    selectionHandles = false,
    insets,
    oncamera,
    oncursor,
    onstats,
  }: {
    editor: Editor;
    painter?: Painter;
    /**
     * Brush outline for the current tool. `eraser`: the pen's eraser end is used. Reactive:
     * when what it reads changes (tool, size…), the outline is redrawn at once.
     */
    brushCursor?: (eraser: boolean) => BrushCursor;
    /** The CSS pointer at a canvas position and zoom, if the tool has its own there. */
    hoverCursor?: (point: Point, zoom: number) => string | null;
    /** The current tool works on the selection: its handles are shown. */
    selectionHandles?: boolean;
    /** Panels over the view: fitting and zooming use the area between them. */
    insets?: () => Insets;
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
  /** Where the pen hovers, for the tool's pointer. It stays put during a stroke. */
  let hoverPoint = $state<Point | null>(null);
  const pointerCursor = $derived(
    hoverPoint && hoverCursor ? hoverCursor(hoverPoint, camera.zoom) : null,
  );
  let panning: { id: number; x: number; y: number } | null = $state(null);
  /** Last cursor position, in canvas pixels, to redraw the outline when the pen flips. */
  let lastCursor: Point | null = null;
  let destroyed = false;

  // svelte-ignore state_referenced_locally
  const pen = painter
    ? new PenInput({
        painter,
        consumeDismissal,
        // Only on the canvas itself, not over a panel or while panning.
        mayStartAt(x, y) {
          const target = document.elementFromPoint(x, y);
          return !spaceDown && !panning && !!target && host.contains(target);
        },
        sample: nativeSample,
      })
    : null;
  const stroking = $derived(pen?.stroking ?? false);

  function setCamera(next: Camera) {
    camera = next;
    view?.setCamera(next, { width: host.clientWidth, height: host.clientHeight });
    oncamera?.(next);
  }

  /** The part of the view that is not under panels. */
  function visibleArea() {
    const { top, right, bottom, left } = insets?.() ?? { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      x: left,
      y: top,
      width: Math.max(1, host.clientWidth - left - right),
      height: Math.max(1, host.clientHeight - top - bottom),
    };
  }

  function center(): Point {
    const area = visibleArea();
    return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  }

  export function fitView() {
    const area = visibleArea();
    const fitted = fit(editor.drawing, area);
    setCamera({ ...fitted, x: fitted.x + area.x, y: fitted.y + area.y });
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
      host.setPointerCapture(e.pointerId);
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      updateCursor(null);
      return;
    }
    // Button 5 is the pen's eraser end.
    if (!pen || (e.button !== 0 && e.button !== 5)) return;
    const eraser = e.button === 5 || (e.buttons & 32) !== 0;
    if (pen.domDown(domSample(e), eraser)) host.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (panning?.id === e.pointerId) {
      setCamera(pan(camera, e.clientX - panning.x, e.clientY - panning.y));
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (stroking) {
      const events = e.getCoalescedEvents?.() ?? [];
      pen?.domMove((events.length ? events : [e]).map(domSample));
    }
    const p = toCanvas(camera, local(e));
    oncursor?.({ x: Math.floor(p.x), y: Math.floor(p.y) });
    if (!stroking) hoverPoint = p;
    updateCursor(panning ? null : p);
  }

  function onPointerUp(e: PointerEvent) {
    if (panning?.id === e.pointerId) panning = null;
    pen?.domUp();
  }

  /** Mice report 0.5 while pressed: they draw at full pressure. */
  function domPressure(e: PointerEvent): number {
    return e.pointerType === "pen" || e.pointerType === "touch" ? e.pressure : 1;
  }

  /** A drawing sample from a native pen event (Linux): positions are relative to the webview. */
  function nativeSample(e: PenEvent): Sample {
    const rect = host.getBoundingClientRect();
    const p = { x: e.x - rect.left, y: e.y - rect.top };
    const pressure = e.source === "pen" || e.source === "eraser" ? e.pressure : 1;
    return sample(p, pressure, { tiltX: e.tiltX, tiltY: e.tiltY, time: e.time });
  }

  /** The outline's shape. Recomputed only when the tool or its settings change. */
  const cursorShape: BrushCursor = $derived(
    // Alt held: the pen will pick a color (see Painter.begin). A stroke keeps its outline.
    held.alt && !stroking
      ? { kind: "picker" }
      : (brushCursor?.((stroking ? pen?.strokeEraser : pen?.hoverEraser) ?? false) ?? {
          kind: "none",
        }),
  );
  // A new shape (other tool, size changed by a shortcut…) shows at once, without waiting
  // for the pen to move.
  $effect(() => {
    void cursorShape;
    untrack(() => updateCursor(lastCursor));
  });

  /** Moves the outline to `p` (canvas pixels), or hides it. */
  function updateCursor(p: Point | null) {
    lastCursor = p;
    view?.setBrushCursor(p ? { ...cursorShape, x: p.x, y: p.y } : null);
  }

  function onKeyDown(e: KeyboardEvent) {
    // Alt alone must not open a menu of the system or the browser.
    if (e.key === "Alt") e.preventDefault();
    if (e.code === "Space" && !isTyping(e)) {
      spaceDown = true;
      e.preventDefault();
    }
    // Also while the queue of a lifted stroke is still being painted.
    // Esc was for the stroke, not for the shortcut (see EditorApp).
    if (e.key === "Escape" && pen?.cancel()) e.preventDefault();
  }

  function syncSelection() {
    const { state, draft } = editor.selection;
    view?.setSelectionDraft(
      draft && { rect: draft.rect, mask: draft.shape ? shapeMask(draft.rect, draft.shape) : null },
    );
    view?.setSelection(
      placementOf(state),
      state.pivot ?? null,
      selectionOutline(state),
      selectionHandles,
    );
  }
  $effect(() => {
    void selectionHandles;
    untrack(syncSelection);
  });

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "Alt") e.preventDefault();
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
        // For the shader blend mode of the selection's preview.
        useBackBuffer: true,
        background: getComputedStyle(host).getPropertyValue("--canvas-bg").trim() || "#2b2b2b",
        resolution: devicePixelRatio,
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) return pixi.destroy();
        app = pixi;
        view = new DrawingView(editor.drawing);
        pixi.stage.addChild(view.root);
        fitView();
        syncSelection();
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
      if (!available || destroyed || !pen) return;
      pen.useNative();
      subscribeNativePen((e) => {
        if (!destroyed) pen.onNative(e);
      });
    });

    const unsubscribeSelection = editor.selection.subscribe(syncSelection);

    // When the window loses focus, end any stroke: the release may happen elsewhere.
    const onBlur = () => pen?.end();
    window.addEventListener("blur", onBlur);

    // Keep the checkerboard and the grid matching the view size.
    const resize = new ResizeObserver(() => setCamera(camera));
    resize.observe(host);

    return () => {
      destroyed = true;
      unsubscribeSelection();
      window.removeEventListener("blur", onBlur);
      pen?.end();
      resize.disconnect();
      view?.destroy();
      app?.destroy();
    };
  });
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div
  class="host"
  class:pick={cursorShape.kind === "picker"}
  class:grab={spaceDown}
  class:grabbing={panning}
  style:cursor={held.alt || spaceDown || panning ? undefined : (pointerCursor ?? undefined)}
  bind:this={host}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onpointerleave={() => {
    oncursor?.(null);
    hoverPoint = null;
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

  /* A pipette with its tip on the pixel picked, with a white halo to show on dark colors. */
  .pick {
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke='white' stroke-width='4' d='m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12M18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3zM2 22l.414-.414'/%3E%3Cpath stroke='black' stroke-width='2' d='m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12M18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3zM2 22l.414-.414'/%3E%3C/svg%3E")
        2 22,
      crosshair;
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
