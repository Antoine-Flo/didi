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
  import { FrameStats, type FrameReport } from "$lib/lab/frame-stats";
  import { placeDabs, type Point } from "$lib/lab/dabs";
  import { subscribeNativePen, type PenEvent } from "$lib/platform/pen";
  import { readAsync, readSync } from "$lib/lab/readback";

  interface ReadRow {
    zone: number;
    /** Blocking read with an idle GPU. */
    idle: number;
    /** Blocking read right after a stroke, the realistic case. */
    afterStroke: number;
    asyncBlocked: number;
    asyncTotal: number;
  }

  interface Dab {
    x: number;
    y: number;
    size: number;
  }

  const native = isTauri();
  const SIZES = [2048, 4096, 8192];
  const LAYER_COUNTS = [1, 5, 10, 20];
  const BENCH_RATES = [0, 100, 1000, 5000, 20000];

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let app: Application;
  let ready = $state(false);

  let docSize = $state(4096);
  let layerCount = $state(1);
  let benchRate = $state(0);
  let brushSize = $state(40);

  let info = $state({ renderer: "-", gpu: "-", maxTexture: 0 });
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
  const batch = new Container();
  const pool: Sprite[] = [];
  let poolUsed = 0;
  let queue: Dab[] = [];
  let dabTexture: Texture;

  // Current stroke.
  let last: Point | null = null;
  let carry = 0;

  const memoryMB = $derived((docSize * docSize * 4 * layerCount) / (1024 * 1024));

  function makeDabTexture(): Texture {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.6)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    return Texture.from(c);
  }

  function buildDocument() {
    for (const child of view.removeChildren()) child.destroy();
    for (const layer of layers) layer.destroy(true);

    const background = new Sprite(Texture.WHITE);
    background.width = background.height = docSize;
    view.addChild(background);

    layers = Array.from({ length: layerCount }, () =>
      RenderTexture.create({ width: docSize, height: docSize }),
    );
    for (const layer of layers) view.addChild(new Sprite(layer));
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
    if (queue.length === 0) return;
    const start = performance.now();
    while (pool.length < queue.length) {
      const sprite = new Sprite(dabTexture);
      sprite.anchor.set(0.5);
      sprite.tint = 0x1a1a1a;
      sprite.alpha = 0.35;
      pool.push(sprite);
      batch.addChild(sprite);
    }
    for (let i = 0; i < queue.length; i++) {
      const dab = queue[i];
      const sprite = pool[i];
      sprite.position.set(dab.x, dab.y);
      sprite.scale.set(dab.size / dabTexture.width);
      sprite.visible = true;
    }
    for (let i = queue.length; i < poolUsed; i++) pool[i].visible = false;
    poolUsed = queue.length;

    app.renderer.render({ container: batch, target: layers[layers.length - 1], clear: false });
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
    if (!last) return;
    const size = Math.max(1, brushSize * pressure);
    const run = placeDabs(last, p, Math.max(1, size * 0.1), carry);
    for (const d of run.dabs) queue.push({ ...d, size });
    carry = run.carry;
    last = p;
  }

  function penUp() {
    last = null;
  }

  function onNative(e: PenEvent) {
    if (e.source !== "pen" && e.source !== "eraser") return;
    const p = toDocument(e.x, e.y);
    if (e.phase === "down" && e.button === 1) penDown(p, e.pressure);
    else if (e.phase === "move") penMove(p, e.pressure);
    else if (e.phase === "up" && e.button === 1) penUp();
  }

  // DOM input, used outside Tauri (e.g. in a browser for comparison).

  function onPointerDown(e: PointerEvent) {
    if (native || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    penDown(toDocument(e.clientX, e.clientY), e.pressure);
  }

  function onPointerMove(e: PointerEvent) {
    if (native) return;
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
    for (const layer of layers) app.renderer.render({ container: empty, target: layer });
  }

  function resetStats() {
    frameStats.reset();
    stampStats.reset();
  }

  // GPU → CPU readback

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  /** Runs `measure` a few times, one per frame, and returns the median. */
  async function median(runs: number, measure: () => number | Promise<number>) {
    const values: number[] = [];
    for (let i = 0; i < runs; i++) {
      await nextFrame();
      values.push(await measure());
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

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

  function readGpuInfo() {
    const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    info.renderer = app.renderer.name;
    if (!gl) return;
    info.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    info.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
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
        if (destroyed) return app.destroy(true);
        dabTexture = makeDabTexture();
        app.stage.addChild(view);
        readGpuInfo();
        buildDocument();
        if (native) subscribeNativePen(onNative);

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
        if (new URLSearchParams(location.search).has("measure")) measureReadback();
      });

    return () => {
      destroyed = true;
      if (!ready) return;
      unsubscribeTick?.();
      for (const layer of layers) layer.destroy(true);
      dabTexture.destroy(true);
      app.destroy(true, { children: true });
    };
  });

  const fmt = (v: number, digits = 1) => v.toFixed(digits);
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

  <aside>
    <h2>GPU</h2>
    <dl>
      <dt>renderer</dt>
      <dd>{info.renderer}</dd>
      <dt>texture max</dt>
      <dd>{info.maxTexture}</dd>
    </dl>
    <p class="gpu">{info.gpu}</p>

    <h2>Document</h2>
    <label>
      Size
      <select bind:value={docSize} onchange={buildDocument} disabled={!ready}>
        {#each SIZES as size (size)}
          <option value={size} disabled={info.maxTexture > 0 && size > info.maxTexture}>
            {size} × {size}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Layers
      <select bind:value={layerCount} onchange={buildDocument} disabled={!ready}>
        {#each LAYER_COUNTS as count (count)}
          <option value={count}>{count}</option>
        {/each}
      </select>
    </label>
    <dl>
      <dt>estimated memory</dt>
      <dd>{fmt(memoryMB, 0)} MB</dd>
    </dl>

    <h2>Brush</h2>
    <label>
      Size: {brushSize} px
      <input type="range" min="2" max="300" bind:value={brushSize} />
    </label>
    <label>
      Benchmark
      <select bind:value={benchRate} onchange={resetStats}>
        {#each BENCH_RATES as rate (rate)}
          <option value={rate}>{rate === 0 ? "off" : `${rate} dabs / frame`}</option>
        {/each}
      </select>
    </label>

    <h2>Measurements</h2>
    <dl>
      <dt>fps</dt>
      <dd>{fmt(frame.fps, 0)}</dd>
      <dt>frame avg</dt>
      <dd>{fmt(frame.avg)} ms</dd>
      <dt>frame p95</dt>
      <dd>{fmt(frame.p95)} ms</dd>
      <dt>frame max</dt>
      <dd>{fmt(frame.max)} ms</dd>
      <dt>stamping (CPU)</dt>
      <dd>{fmt(stampMs, 2)} ms</dd>
      <dt>dabs / s</dt>
      <dd>{fmt(dabsPerSecond, 0)}</dd>
    </dl>

    <h2>GPU → CPU readback</h2>
    <button onclick={measureReadback} disabled={!ready || measuring}>
      {measuring ? "Measuring…" : "Measure"}
    </button>
    {#each readRows as row (row.zone)}
      <h3>{row.zone} × {row.zone} ({fmt((row.zone * row.zone * 4) / (1024 * 1024), 2)} MB)</h3>
      <dl>
        <dt>blocking, GPU idle</dt>
        <dd>{fmt(row.idle, 2)} ms</dd>
        <dt>blocking, after a stroke</dt>
        <dd>{fmt(row.afterStroke, 2)} ms</dd>
        <dt>async, blocked</dt>
        <dd>{fmt(row.asyncBlocked, 2)} ms</dd>
        <dt>async, available after</dt>
        <dd>{fmt(row.asyncTotal, 1)} ms</dd>
      </dl>
    {/each}

    <div class="actions">
      <button onclick={clearLayers} disabled={!ready}>Clear</button>
      <button onclick={fit} disabled={!ready}>Fit</button>
    </div>
    <p class="hint">Wheel: zoom. Draw with the pen on the canvas.</p>
  </aside>
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
    height: 100vh;
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

  aside {
    width: 260px;
    padding: 12px;
    overflow-y: auto;
    background: #26262a;
    border-left: 1px solid #333;
  }

  h2 {
    margin: 14px 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
  }

  h3 {
    margin: 10px 0 4px;
    font-size: 11px;
    font-weight: 600;
    color: #aaa;
  }

  aside > button {
    width: 100%;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .gpu,
  .hint {
    color: #777;
    font-size: 11px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  select,
  input {
    width: 100%;
  }

  select {
    padding: 4px;
    background: #333;
    color: #ddd;
    border: 1px solid #444;
    border-radius: 4px;
  }

  .actions {
    display: flex;
    gap: 6px;
    margin-top: 16px;
  }

  button {
    flex: 1;
    padding: 6px;
    background: #333;
    color: #ddd;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover {
    background: #3c3c40;
  }
</style>
