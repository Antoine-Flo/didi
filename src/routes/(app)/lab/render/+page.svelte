<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import {
    Application,
    Container,
    Rectangle,
    RenderTexture,
    Sprite,
    Texture,
    type WebGLRenderer,
  } from "pixi.js";
  import { FrameStats, type FrameReport } from "#lib/lab/frame-stats.js";
  import { placeDabs, type Point } from "#lib/lab/dabs.js";
  import { DabBatch, makeDabTexture, type Dab } from "#lib/lab/dab-batch.js";
  import { readGpuInfo, type GpuInfo } from "#lib/lab/gpu-info.js";
  import { subscribeNativePen, type PenEvent } from "#lib/platform/pen.js";
  import { median, readAsync, readSync, type ReadRow } from "#lib/lab/readback.js";
  import RenderPanel from "#lib/lab/ui/RenderPanel.svelte";

  const native = isTauri();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let app: Application;
  let ready = $state(false);

  let docSize = $state(4096);
  let layerCount = $state(1);
  let benchRate = $state(0);
  let brushSize = $state(40);

  let info = $state<GpuInfo>({ renderer: "-", gpu: "-", maxTexture: 0 });
  let frame = $state<FrameReport>({ fps: 0, avg: 0, p95: 0, max: 0 });
  let stampMs = $state(0);
  let dabsPerSecond = $state(0);
  let readRows = $state<ReadRow[]>([]);
  let measuring = $state(false);

  const frameStats = new FrameStats();
  const stampStats = new FrameStats();
  let dabCount = 0;

  // Document: a white background and a stack of layers, each a render texture.
  const view = new Container();
  let layers: RenderTexture[] = [];

  // Dabs are queued as input arrives and stamped once per frame into the top layer.
  const batch = new DabBatch();
  let queue: Dab[] = [];
  let dabTexture: Texture;

  // Current stroke.
  let last: Point | null = null;
  let carry = 0;

  const memoryMB = $derived((docSize * docSize * 4 * layerCount) / (1024 * 1024));

  function buildDocument() {
    for (const child of view.removeChildren()) {
      child.destroy();
    }
    for (const layer of layers) {
      layer.destroy(true);
    }

    const background = new Sprite(Texture.WHITE);
    background.width = background.height = docSize;
    view.addChild(background);

    layers = Array.from({ length: layerCount }, () =>
      RenderTexture.create({ width: docSize, height: docSize }),
    );
    for (const layer of layers) {
      view.addChild(new Sprite(layer));
    }
    fit();
  }

  function fit() {
    const { width, height } = app.screen;
    const scale = Math.min(width / docSize, height / docSize) * 0.95;
    view.scale.set(scale);
    view.position.set((width - docSize * scale) / 2, (height - docSize * scale) / 2);
  }

  function toDocument(clientX: number, clientY: number): Point {
    const rect = app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale.x,
      y: (clientY - rect.top - view.y) / view.scale.y,
    };
  }

  function flush() {
    if (queue.length === 0) {
      return;
    }
    const start = performance.now();
    batch.stamp(app.renderer, layers[layers.length - 1], queue, dabTexture);
    stampStats.push(performance.now() - start);
    dabCount += queue.length;
    queue = [];
  }

  // Automatic benchmark: dabs along a Lissajous curve.
  let benchTime = 0;
  function queueBenchmark() {
    for (let i = 0; i < benchRate; i++) {
      benchTime += 0.0002;
      queue.push({
        x: docSize * (0.5 + 0.45 * Math.sin(3 * benchTime)),
        y: docSize * (0.5 + 0.45 * Math.sin(4 * benchTime + 1)),
        size: brushSize,
      });
    }
  }

  // Pen input

  function penDown(p: Point, pressure: number) {
    last = p;
    carry = 0;
    queue.push({ ...p, size: Math.max(1, brushSize * pressure) });
  }

  function penMove(p: Point, pressure: number) {
    if (!last) {
      return;
    }
    const size = Math.max(1, brushSize * pressure);
    const run = placeDabs(last, p, Math.max(1, size * 0.1), carry);
    for (const d of run.dabs) {
      queue.push({ ...d, size });
    }
    carry = run.carry;
    last = p;
  }

  function penUp() {
    last = null;
  }

  function onNative(e: PenEvent) {
    if (e.source !== "pen" && e.source !== "eraser") {
      return;
    }
    const p = toDocument(e.x, e.y);
    if (e.phase === "down" && e.button === 1) {
      penDown(p, e.pressure);
    } else if (e.phase === "move") {
      penMove(p, e.pressure);
    } else if (e.phase === "up" && e.button === 1) {
      penUp();
    }
  }

  // DOM input, used outside Tauri (e.g. in a browser for comparison).

  function onPointerDown(e: PointerEvent) {
    if (native || e.button !== 0) {
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    penDown(toDocument(e.clientX, e.clientY), e.pressure);
  }

  function onPointerMove(e: PointerEvent) {
    if (native) {
      return;
    }
    for (const c of e.getCoalescedEvents?.() ?? [e]) {
      penMove(toDocument(c.clientX, c.clientY), c.pressure);
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    view.position.set(mx - (mx - view.x) * factor, my - (my - view.y) * factor);
    view.scale.set(view.scale.x * factor);
  }

  const empty = new Container();
  function clearLayers() {
    for (const layer of layers) {
      app.renderer.render({ container: empty, target: layer });
    }
  }

  function resetStats() {
    frameStats.reset();
    stampStats.reset();
  }

  // GPU → CPU readback

  function queueStroke(zone: Rectangle) {
    for (let i = 0; i < 1000; i++) {
      queue.push({
        x: zone.x + Math.random() * zone.width,
        y: zone.y + Math.random() * zone.height,
        size: brushSize,
      });
    }
  }

  async function measureReadback() {
    measuring = true;
    benchRate = 0;
    readRows = [];
    const renderer = app.renderer as WebGLRenderer;
    const target = layers[layers.length - 1];
    for (const zone of [256, 1024, docSize]) {
      const rect = new Rectangle(0, 0, zone, zone);
      const idle = await median(5, () => readSync(renderer, target, rect).blocked);
      const afterStroke = await median(5, () => {
        queueStroke(rect);
        flush();
        return readSync(renderer, target, rect).blocked;
      });
      const results = [];
      for (let i = 0; i < 3; i++) {
        queueStroke(rect);
        flush();
        results.push(await readAsync(renderer, target, rect));
      }
      results.sort((a, b) => a.total - b.total);
      const mid = results[1];
      readRows.push({
        zone,
        idle,
        afterStroke,
        asyncBlocked: mid.blocked,
        asyncTotal: mid.total,
      });
    }
    measuring = false;
  }

  onMount(() => {
    let destroyed = false;
    let unsubscribeTick: (() => void) | null = null;
    app = new Application();

    app
      .init({
        canvas,
        resizeTo: host,
        background: 0x1d1d1f,
        resolution: devicePixelRatio,
        autoDensity: true,
        antialias: false,
        preference: "webgl",
      })
      .then(() => {
        if (destroyed) {
          return app.destroy(true);
        }
        dabTexture = makeDabTexture();
        app.stage.addChild(view);
        info = readGpuInfo(app.renderer);
        buildDocument();
        if (native) {
          subscribeNativePen(onNative);
        }

        let sinceUi = 0;
        const tick = () => {
          frameStats.push(app.ticker.deltaMS);
          queueBenchmark();
          flush();
          sinceUi += app.ticker.deltaMS;
          if (sinceUi >= 250) {
            frame = frameStats.report();
            stampMs = stampStats.report().avg;
            dabsPerSecond = (dabCount * 1000) / sinceUi;
            dabCount = 0;
            sinceUi = 0;
          }
        };
        app.ticker.add(tick);
        unsubscribeTick = () => app.ticker.remove(tick);
        ready = true;
        // ?measure starts the readback measurement on load (handy for headless runs).
        if (new URLSearchParams(location.search).has("measure")) {
          measureReadback();
        }
      });

    return () => {
      destroyed = true;
      if (!ready) {
        return;
      }
      unsubscribeTick?.();
      for (const layer of layers) {
        layer.destroy(true);
      }
      dabTexture.destroy(true);
      app.destroy(true, { children: true });
    };
  });
</script>

<div class="lab">
  <div
    class="viewport"
    bind:this={host}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={penUp}
    onpointercancel={penUp}
    onwheel={onWheel}
    oncontextmenu={(e) => e.preventDefault()}
    role="application"
  >
    <canvas bind:this={canvas}></canvas>
  </div>

  <RenderPanel
    bind:docSize
    bind:layerCount
    bind:benchRate
    bind:brushSize
    {ready}
    {measuring}
    {info}
    {memoryMB}
    {frame}
    {stampMs}
    {dabsPerSecond}
    {readRows}
    onbuild={buildDocument}
    onresetstats={resetStats}
    onmeasure={measureReadback}
    onclear={clearLayers}
    onfit={fit}
  />
</div>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    background: #1d1d1f;
    color: #ccc;
    font:
      12px/1.4 system-ui,
      sans-serif;
  }

  .lab {
    display: flex;
    height: 100%;
  }

  .viewport {
    flex: 1;
    min-width: 0;
    touch-action: none;
    cursor: crosshair;
    overflow: hidden;
  }

  canvas {
    display: block;
  }
</style>
