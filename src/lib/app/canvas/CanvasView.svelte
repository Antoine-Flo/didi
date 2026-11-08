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

  /** How far ahead the pointer is drawn, in milliseconds of the pen's movement. */
  const PREDICT_MS = 30;
  /** The pen's speed is averaged over about this long, in milliseconds. */
  const VELOCITY_MS = 25;
  /** At most this far ahead, in window pixels. */
  const MAX_LEAD = 60;
  /** Without a move for this long, the pen has stopped: the pointer goes back under it. */
  const STILL_MS = 40;
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Application } from "pixi.js";
  import { consumeDismissal } from "#lib/app/canvas/dismissal.js";
  import { held } from "#lib/app/canvas/modifiers.svelte.js";
  import { isTyping } from "#lib/app/commands/keyboard.js";
  import { themePrefs } from "#lib/app/shell/theme-prefs.svelte.js";
  import type { Painter } from "#lib/app/canvas/painter.js";
  import type { BrushCursor, Sample } from "#lib/app/tools/tool.js";
  import type { RGB } from "#lib/core/color/color.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { PenInput } from "#lib/app/canvas/pen-input.svelte.js";
  import { TouchGestures } from "#lib/app/canvas/touch-gestures.js";
  import { nativePenAvailable, subscribeNativePen, type PenEvent } from "#lib/platform/pen.js";
  import {
    fit,
    mirrorAt,
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
  import { DrawingView, type BrushCursorState } from "#lib/render/drawing-view.js";

  let {
    editor,
    painter,
    brushCursor,
    brushColor = null,
    hoverCursor,
    selectionHandles = false,
    pixelGrid = false,
    touchRotation = false,
    fingerDraws = true,
    onpen,
    insets,
    oncamera,
    oncursor,
    onstats,
    oncommand,
  }: {
    editor: Editor;
    painter?: Painter;
    /**
     * Brush outline for the current tool. `eraser`: the pen's eraser end is used. Reactive:
     * when what it reads changes (tool, size…), the outline is redrawn at once.
     */
    brushCursor?: (eraser: boolean) => BrushCursor;
    /** The color drawn with: pixel-art tips show their pixels in it. */
    brushColor?: RGB | null;
    /** The CSS pointer at a canvas position and zoom, if the tool has its own there. */
    hoverCursor?: (point: Point, zoom: number) => string | null;
    /** The current tool works on the selection: its handles are shown. */
    selectionHandles?: boolean;
    /** The pixels' grid shows when zoomed in. */
    pixelGrid?: boolean;
    /** Two fingers may turn the view. */
    touchRotation?: boolean;
    /** One finger draws; else it moves the view (see touch-gestures.ts). */
    fingerDraws?: boolean;
    /** A pen was used: see LayoutPrefs.penSeen. */
    onpen?: () => void;
    /** Panels over the view: fitting and zooming use the area between them. */
    insets?: () => Insets;
    oncamera?: (camera: Camera) => void;
    oncursor?: (point: Point | null) => void;
    /** Called twice a second with rendering statistics. */
    onstats?: (stats: ViewStats) => void;
    /** A gesture asks for a command: a two-finger tap undoes, a three-finger tap redoes. */
    oncommand?: (id: string) => void;
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

  /** Fingers move the view: the brush's pointer is hidden meanwhile. */
  let touchNavigating = $state(false);
  /** A finger is drawing (not the pen). */
  let touchStroke = false;
  const touch = new TouchGestures({
    camera: () => camera,
    setCamera,
    fingerDraws: () => fingerDraws,
    mayRotate: () => touchRotation,
    beginStroke: (p, time) => {
      touchStroke = !!pen?.domDown(sample(p, 1, { time }), false, true);
      return touchStroke;
    },
    moveStroke: (p, time) => pen?.domMove([sample(p, 1, { time })]),
    endStroke: () => {
      touchStroke = false;
      pen?.domUp();
    },
    cancelStroke: () => {
      touchStroke = false;
      pen?.cancel();
    },
    undo: () => oncommand?.("history.undo"),
    redo: () => oncommand?.("history.redo"),
  });

  /** The pen came down: fingers still on the screen are the resting hand. */
  function penDown() {
    onpen?.();
    touch.abandon();
    touchNavigating = false;
  }

  const viewSize = () => ({ width: host.clientWidth, height: host.clientHeight });

  function setCamera(next: Camera) {
    camera = next;
    view?.setCamera(next, viewSize());
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

  /** Fits the canvas in the view, unturned; a mirrored view stays mirrored. */
  export function fitView() {
    const area = visibleArea();
    const fitted = fit(editor.drawing, area);
    const next = { ...fitted, x: fitted.x + area.x, y: fitted.y + area.y };
    setCamera(camera.mirrored ? mirrorAt(next, center()) : next);
  }

  /** Shows the drawing reversed, left to right, or back: the drawing doesn't change. */
  export function mirrorView() {
    setCamera(mirrorAt(camera, center()));
  }

  export function zoomBy(factor: number) {
    setCamera(zoomAt(camera, center(), factor));
  }

  /** Sets the zoom to an absolute value, around the center of the view. */
  export function zoomTo(zoom: number) {
    zoomBy(zoom / camera.zoom);
  }

  /** Shows what a resize would give, without changing the drawing (see DrawingView). */
  export function previewResize(preview: Parameters<DrawingView["setResizePreview"]>[0]) {
    view?.setResizePreview(preview);
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
    if (e.pointerType === "pen") penDown();
    if (e.pointerType === "touch") {
      // The palm, while the pen draws: ignored.
      if (stroking && !touchStroke) return;
      touch.down(e.pointerId, local(e), e.timeStamp);
      touchNavigating = touch.navigating;
      return;
    }
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
    if (e.pointerType === "touch") {
      const events = touch.stroking ? (e.getCoalescedEvents?.() ?? []) : [];
      for (const c of events.length ? events : [e]) touch.move(e.pointerId, local(c), c.timeStamp);
      touchNavigating = touch.navigating;
      if (touchNavigating) return;
    }
    if (panning?.id === e.pointerId) {
      setCamera(pan(camera, e.clientX - panning.x, e.clientY - panning.y));
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (stroking && e.pointerType !== "touch") {
      const events = e.getCoalescedEvents?.() ?? [];
      pen?.domMove((events.length ? events : [e]).map(domSample));
    }
    // A pen sends hundreds of moves a second: the pointer follows the last one, once per frame
    // (see showPointer), so they do not pile up behind it.
    const at = {
      clientX: e.clientX,
      clientY: e.clientY,
      time: e.timeStamp,
      pen: e.pointerType === "pen",
    };
    if (pointerAt && at.time > pointerAt.time) {
      // Window pixels per millisecond, smoothed over about VELOCITY_MS.
      const dt = at.time - pointerAt.time;
      const vx = (at.clientX - pointerAt.clientX) / dt;
      const vy = (at.clientY - pointerAt.clientY) / dt;
      const k = 1 - Math.exp(-dt / VELOCITY_MS);
      velocity = { x: velocity.x + (vx - velocity.x) * k, y: velocity.y + (vy - velocity.y) * k };
    }
    pointerAt = at;
    pointerMoved = true;
  }

  /** The last pointer position, in the window, and when it was there (event time). */
  let pointerAt: { clientX: number; clientY: number; time: number; pen: boolean } | null = null;
  /** The pointer moved since it was last shown. */
  let pointerMoved = false;
  let velocity = { x: 0, y: 0 };

  /**
   * Moves the pointer, the status bar's position and the tool's hover to the last move.
   * The pointer drawn shows on screen a few frames after the pen got there: it is drawn a
   * little ahead, where the pen is heading, to stay under it. Not when the pen has stopped, nor
   * for a mouse (its moves are too irregular: it would shake), nor for pixel-art tips (their
   * pixels are where the pen really is, under the system pointer).
   */
  function showPointer(now: number) {
    if (!pointerAt) return;
    const still = now - pointerAt.time > STILL_MS;
    if (!pointerMoved && still) {
      if (velocity.x === 0 && velocity.y === 0) return;
      velocity = { x: 0, y: 0 };
    }
    pointerMoved = false;
    const p = toCanvas(camera, local(pointerAt));
    reportCursor(p);
    if (!stroking) hoverPoint = p;
    let lead = { x: velocity.x * PREDICT_MS, y: velocity.y * PREDICT_MS };
    const length = Math.hypot(lead.x, lead.y);
    if (still || !pointerAt.pen || cursorShape.kind !== "circle") lead = { x: 0, y: 0 };
    else if (length > MAX_LEAD)
      lead = { x: (lead.x * MAX_LEAD) / length, y: (lead.y * MAX_LEAD) / length };
    const ahead = toCanvas(
      camera,
      local({ clientX: pointerAt.clientX + lead.x, clientY: pointerAt.clientY + lead.y }),
    );
    updateCursor(panning || touchNavigating ? null : ahead);
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerType === "touch") {
      if (e.type === "pointercancel") touch.cancel(e.pointerId);
      else touch.up(e.pointerId, e.timeStamp);
      touchNavigating = touch.navigating;
      return;
    }
    if (panning?.id === e.pointerId) panning = null;
    // Not the stroke of a finger: a mouse button released elsewhere.
    if (!touchStroke) pen?.domUp();
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
    void brushColor;
    untrack(() => updateCursor(lastCursor));
  });

  /** The view draws the pointer itself (see DrawingView): the system's is hidden. */
  const ownPointer = $derived(cursorShape.kind === "circle" || cursorShape.kind === "picker");

  /** Moves the outline to `p` (canvas pixels), or hides it. */
  function updateCursor(p: Point | null) {
    lastCursor = p;
    view?.setBrushCursor(p ? cursorState(p) : null);
  }

  function cursorState(p: Point): BrushCursorState | null {
    const c = cursorShape;
    if (c.kind === "circle") return { ...c, x: p.x, y: p.y };
    if (c.kind === "square" || c.kind === "pixel-round") {
      const fill =
        c.opacity !== undefined && brushColor
          ? {
              color: (brushColor[0] << 16) | (brushColor[1] << 8) | brushColor[2],
              alpha: c.opacity,
            }
          : undefined;
      return { kind: c.kind, size: c.size, x: p.x, y: p.y, fill };
    }
    if (c.kind === "picker") return { kind: "picker", x: p.x, y: p.y };
    return null;
  }

  /** Tells the pixel under the pen, only when it changes: the status bar shows it. */
  let reported: Point | null = null;
  function reportCursor(p: Point | null) {
    const pixel = p && { x: Math.floor(p.x), y: Math.floor(p.y) };
    if (pixel?.x === reported?.x && pixel?.y === reported?.y) return;
    reported = pixel;
    oncursor?.(pixel);
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
  $effect(() => {
    const shown = pixelGrid;
    untrack(() => view?.setGridShown(shown, camera, viewSize()));
  });
  // The background follows the theme when it changes (Preferences).
  $effect(() => {
    const background = themePrefs.theme.tokens["canvas-bg"];
    if (app) app.renderer.background.color = background;
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
        view.setGridShown(pixelGrid, camera, viewSize());
        pixi.stage.addChild(view.root);
        fitView();
        syncSelection();
        let elapsed = 0;
        pixi.ticker.add((ticker) => {
          showPointer(performance.now());
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
        if ((e.source === "pen" || e.source === "eraser") && e.phase === "down") penDown();
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
  class:grab={spaceDown}
  class:grabbing={panning}
  class:own-pointer={ownPointer && !pointerCursor}
  class:sight={(cursorShape.kind === "square" || cursorShape.kind === "pixel-round") &&
    !pointerCursor}
  style:cursor={held.alt || spaceDown || panning ? undefined : (pointerCursor ?? undefined)}
  bind:this={host}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onpointerleave={() => {
    pointerAt = null;
    velocity = { x: 0, y: 0 };
    reportCursor(null);
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

  /* The view draws the pointer (see ownPointer). */
  .own-pointer {
    cursor: none;
  }

  /*
   * Pixel-art tips: a small sight, like Aseprite's, white edged with black, open on the pixel.
   * The system shows it: no delay. Drawn for each screen scale (image-set), else WebKitGTK
   * stretches it on a scaled screen, its tip off its center.
   */
  .sight {
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 15 15'%3E%3Cpath d='M1.5 7.5H5M10 7.5h3.5M7.5 1.5V5M7.5 10v3.5' stroke='black' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M1 7.5h4.5M9.5 7.5H14M7.5 1v4.5M7.5 9.5V14' stroke='white' stroke-width='1'/%3E%3C/svg%3E")
        7 7,
      crosshair;
    cursor:
      -webkit-image-set(
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 15 15'%3E%3Cpath d='M1.5 7.5H5M10 7.5h3.5M7.5 1.5V5M7.5 10v3.5' stroke='black' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M1 7.5h4.5M9.5 7.5H14M7.5 1v4.5M7.5 9.5V14' stroke='white' stroke-width='1'/%3E%3C/svg%3E")
            1x,
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 15 15'%3E%3Cpath d='M1.5 7.5H5M10 7.5h3.5M7.5 1.5V5M7.5 10v3.5' stroke='black' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M1 7.5h4.5M9.5 7.5H14M7.5 1v4.5M7.5 9.5V14' stroke='white' stroke-width='1'/%3E%3C/svg%3E")
            2x
        )
        7 7,
      crosshair;
    cursor:
      image-set(
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 15 15'%3E%3Cpath d='M1.5 7.5H5M10 7.5h3.5M7.5 1.5V5M7.5 10v3.5' stroke='black' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M1 7.5h4.5M9.5 7.5H14M7.5 1v4.5M7.5 9.5V14' stroke='white' stroke-width='1'/%3E%3C/svg%3E")
            1x,
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 15 15'%3E%3Cpath d='M1.5 7.5H5M10 7.5h3.5M7.5 1.5V5M7.5 10v3.5' stroke='black' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M1 7.5h4.5M9.5 7.5H14M7.5 1v4.5M7.5 9.5V14' stroke='white' stroke-width='1'/%3E%3C/svg%3E")
            2x
        )
        7 7,
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
