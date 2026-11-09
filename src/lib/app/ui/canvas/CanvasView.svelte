<script lang="ts" module>
  import { CullerPlugin, extensions } from "pixi.js";
  import type { Insets as PanelInsets } from "#lib/app/input/view-navigation.js";

  // Skips off-screen tiles when rendering.
  extensions.add(CullerPlugin);

  export interface ViewStats {
    fps: number;
    /** Tile sprites on the GPU. */
    tiles: number;
  }

  /** Space taken by panels over the view, in pixels, on each side. */
  export type Insets = PanelInsets;
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Application } from "pixi.js";
  import { held } from "#lib/app/input/modifiers.svelte.js";
  import { themePrefs } from "#lib/app/prefs/theme-prefs.svelte.js";
  import type { Painter } from "#lib/app/input/painter.js";
  import { CanvasInput } from "#lib/app/input/canvas-input.svelte.js";
  import { ViewNavigation } from "#lib/app/input/view-navigation.js";
  import { brushCursorState } from "#lib/app/tools/brush-cursor.js";
  import type { BrushCursor } from "#lib/app/tools/tool.js";
  import type { RGB } from "#lib/core/color/color.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { toCanvas, type Camera, type Point } from "#lib/render/camera.js";
  import { placementOf, selectionOutline } from "#lib/core/selection/selection.js";
  import { shapeMask } from "#lib/core/selection/shape.js";
  import { DrawingView } from "#lib/render/drawing-view.js";

  let {
    editor,
    painter,
    brushCursor,
    brushColor = null,
    hoverCursor,
    selectionHandles = false,
    pixelGrid = false,
    tileGrid = null,
    touchRotation = false,
    pixelZoom = false,
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
    /** The tiles' grid, shown with the pixels' grid. Null: none. */
    tileGrid?: { width: number; height: number } | null;
    /** Two fingers may turn the view. */
    touchRotation?: boolean;
    /** Zoomed out, the zoom keeps to levels where every pixel is the same size (pixel art). */
    pixelZoom?: boolean;
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

  const viewSize = () => ({ width: host.clientWidth, height: host.clientHeight });

  const navigation = new ViewNavigation({
    size: viewSize,
    insets: () => insets?.(),
    pixelZoom: () => pixelZoom,
    changed: (next) => {
      view?.setCamera(next, viewSize());
      oncamera?.(next);
    },
  });

  /** Where the pen hovers, for the tool's pointer. It stays put during a stroke. */
  let hoverPoint = $state<Point | null>(null);
  const pointerCursor = $derived(
    hoverPoint && hoverCursor ? hoverCursor(hoverPoint, navigation.camera.zoom) : null,
  );
  /** Last cursor position, in canvas pixels, to redraw the outline when the pen flips. */
  let lastCursor: Point | null = null;
  let destroyed = false;

  // svelte-ignore state_referenced_locally
  const input = new CanvasInput({
    element: () => host,
    painter,
    navigation,
    fingerDraws: () => fingerDraws,
    mayRotate: () => touchRotation,
    penUsed: () => onpen?.(),
    command: (id) => oncommand?.(id),
    hideCursor: () => updateCursor(null),
  });
  const pen = input.pen;
  const stroking = $derived(input.stroking);

  /** Fits the canvas in the view, unturned; a mirrored view stays mirrored. */
  export function fitView() {
    navigation.fit(editor.drawing);
  }

  /** Shows the drawing reversed, left to right, or back: the drawing doesn't change. */
  export function mirrorView() {
    navigation.mirror();
  }

  /** One step in (1) or out (-1), around the center of the view. */
  export function zoomStep(direction: 1 | -1) {
    navigation.zoomStep(direction);
  }

  /** Sets the zoom to an absolute value (the nearest level in pixel art), around the center. */
  export function zoomTo(zoom: number) {
    navigation.zoomTo(zoom);
  }

  /** Shows what a resize would give, without changing the drawing (see DrawingView). */
  export function previewResize(preview: Parameters<DrawingView["setResizePreview"]>[0]) {
    view?.setResizePreview(preview);
  }

  export function rotateBy(angle: number) {
    navigation.rotateBy(angle);
  }

  export function resetRotation() {
    navigation.resetRotation();
  }

  /**
   * Moves the pointer, the shown position and the tool's hover to the last move.
   * The pointer drawn shows on screen a few frames after the pen got there: it is drawn a
   * little ahead, where the pen is heading, to stay under it. Not when the pen has stopped, nor
   * for a mouse (its moves are too irregular: it would shake), nor for pixel-art tips (their
   * pixels are where the pen really is, under the system pointer).
   */
  function showPointer(now: number) {
    const frame = input.lead.frame(now, cursorShape.kind === "circle");
    if (!frame) {
      return;
    }
    const camera = navigation.camera;
    const p = toCanvas(camera, input.local(frame.at));
    reportCursor(p);
    if (!stroking) {
      hoverPoint = p;
    }
    const ahead = toCanvas(camera, input.local(frame.ahead));
    updateCursor(input.panning || input.touchNavigating ? null : ahead);
  }

  function onPointerLeave() {
    input.lead.leave();
    reportCursor(null);
    hoverPoint = null;
    updateCursor(null);
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
    view?.setBrushCursor(p ? brushCursorState(cursorShape, p, brushColor) : null);
  }

  /** Tells the pixel under the pen, only when it changes: the document's information shows it. */
  let reported: Point | null = null;
  function reportCursor(p: Point | null) {
    const pixel = p && { x: Math.floor(p.x), y: Math.floor(p.y) };
    if (pixel?.x === reported?.x && pixel?.y === reported?.y) {
      return;
    }
    reported = pixel;
    oncursor?.(pixel);
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
    const tiles = tileGrid;
    untrack(() => view?.setGridShown(shown, tiles, navigation.camera, viewSize()));
  });
  // The background follows the theme when it changes (Preferences).
  $effect(() => {
    const background = themePrefs.theme.tokens["canvas-bg"];
    if (app) {
      app.renderer.background.color = background;
    }
  });

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
        if (destroyed) {
          return pixi.destroy();
        }
        app = pixi;
        view = new DrawingView(editor.drawing);
        view.setGridShown(pixelGrid, tileGrid, navigation.camera, viewSize());
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

    input.connectNativePen(() => destroyed);

    const unsubscribeSelection = editor.selection.subscribe(syncSelection);

    // When the window loses focus, end any stroke: the release may happen elsewhere.
    const onBlur = () => pen?.end();
    window.addEventListener("blur", onBlur);

    // Keep the checkerboard and the grid matching the view size.
    const resize = new ResizeObserver(() => navigation.set(navigation.camera));
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

<svelte:window onkeydown={(e) => input.keyDown(e)} onkeyup={(e) => input.keyUp(e)} />

<div
  class="host"
  class:grab={input.spaceDown}
  class:grabbing={input.panning}
  class:own-pointer={ownPointer && !pointerCursor}
  class:sight={(cursorShape.kind === "square" || cursorShape.kind === "pixel-round") &&
    !pointerCursor}
  style:cursor={held.alt || input.spaceDown || input.panning
    ? undefined
    : (pointerCursor ?? undefined)}
  bind:this={host}
  onwheel={(e) => navigation.wheel(input.local(e), e)}
  onpointerdown={(e) => input.pointerDown(e)}
  onpointermove={(e) => input.pointerMove(e)}
  onpointerup={(e) => input.pointerUp(e)}
  onpointercancel={(e) => input.pointerUp(e)}
  onpointerleave={onPointerLeave}
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
