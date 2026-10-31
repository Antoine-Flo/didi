<script lang="ts" module>
  import { CullerPlugin, extensions } from "pixi.js";

  // Skips off-screen tiles when rendering.
  extensions.add(CullerPlugin);

  export interface ViewStats {
    fps: number;
    /** Tile sprites on the GPU. */
    tiles: number;
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { Application } from "pixi.js";
  import { isTyping } from "$lib/app/keyboard";
  import type { Editor } from "$lib/core/editor";
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
    oncamera,
    oncursor,
    onstats,
  }: {
    editor: Editor;
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

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (panning?.id === e.pointerId) {
      setCamera(pan(camera, e.clientX - panning.x, e.clientY - panning.y));
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    const p = toCanvas(camera, local(e));
    oncursor?.({ x: Math.floor(p.x), y: Math.floor(p.y) });
  }

  function onPointerUp(e: PointerEvent) {
    if (panning?.id === e.pointerId) panning = null;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === "Space" && !isTyping(e)) {
      spaceDown = true;
      e.preventDefault();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === "Space") spaceDown = false;
  }

  onMount(() => {
    let destroyed = false;
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
          view?.flush();
          elapsed += ticker.deltaMS;
          if (elapsed >= 500 && view) {
            onstats?.({ fps: ticker.FPS, tiles: view.tileCount });
            elapsed = 0;
          }
        });
      });

    // Keep the checkerboard and the grid matching the view size.
    const resize = new ResizeObserver(() => setCamera(camera));
    resize.observe(host);

    return () => {
      destroyed = true;
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
  onpointerleave={() => oncursor?.(null)}
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
