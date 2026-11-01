<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { InputStats, type InputReport, type InputSample } from "#lib/lab/input-stats.js";
  import { subscribeNativePen, type PenEvent } from "#lib/platform/pen.js";

  type Source = "dom" | "native";

  interface Live {
    type: string;
    pressure: number;
    tiltX: number;
    tiltY: number;
    buttons: number;
  }

  interface Stroke {
    stats: InputStats;
    last: { x: number; y: number } | null;
  }

  const native = isTauri();
  const proto = typeof PointerEvent !== "undefined" ? PointerEvent.prototype : null;
  const support = {
    coalescedEvents: !!proto && "getCoalescedEvents" in proto,
    predictedEvents: !!proto && "getPredictedEvents" in proto,
    pointerRawUpdate: typeof window !== "undefined" && "onpointerrawupdate" in window,
    altitudeAzimuth: !!proto && "altitudeAngle" in proto,
    nativeInput: native,
  };

  const emptyLive: Live = { type: "-", pressure: 0, tiltX: 0, tiltY: 0, buttons: 0 };

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  let drawSource = $state<Source>(native ? "native" : "dom");
  let live = $state<Record<Source, Live>>({ dom: emptyLive, native: emptyLive });
  let reports = $state<Record<Source, InputReport | null>>({ dom: null, native: null });
  let buttonLog = $state<string[]>([]);
  let copyState = $state<string | null>(null);

  const strokes: Record<Source, Stroke | null> = { dom: null, native: null };
  const pendingLive: Partial<Record<Source, Live>> = {};

  /** Draws a segment to (x, y), given in viewport CSS pixels. */
  function drawTo(source: Source, x: number, y: number, pressure: number) {
    const stroke = strokes[source];
    if (!stroke) return;
    const r = canvas.getBoundingClientRect();
    const p = { x: x - r.left, y: y - r.top };
    if (stroke.last && source === drawSource) {
      ctx.lineWidth = 1 + pressure * 24;
      ctx.beginPath();
      ctx.moveTo(stroke.last.x, stroke.last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    stroke.last = p;
  }

  function logButton(line: string) {
    buttonLog = [line, ...buttonLog].slice(0, 10);
  }

  // DOM pointer events

  function domSamples(e: PointerEvent): PointerEvent[] {
    if (support.coalescedEvents) {
      const list = e.getCoalescedEvents();
      if (list.length > 0) return list;
    }
    return [e];
  }

  function domSample(e: PointerEvent): InputSample {
    return { time: e.timeStamp, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY };
  }

  function onDown(e: PointerEvent) {
    logButton(`dom down ${e.pointerType} button=${e.button} buttons=${e.buttons}`);
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    strokes.dom = { stats: new InputStats(), last: null };
    strokes.dom.stats.record([domSample(e)], performance.now(), e.timeStamp);
    drawTo("dom", e.clientX, e.clientY, e.pressure);
  }

  function onMove(e: PointerEvent) {
    pendingLive.dom = {
      type: e.pointerType,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      buttons: e.buttons,
    };
    const stroke = strokes.dom;
    if (!stroke) return;
    const samples = domSamples(e);
    stroke.stats.record(samples.map(domSample), performance.now(), e.timeStamp);
    for (const s of samples) drawTo("dom", s.clientX, s.clientY, s.pressure);
  }

  function onUp(e: PointerEvent) {
    logButton(`dom up   ${e.pointerType} button=${e.button} buttons=${e.buttons}`);
    if (!strokes.dom) return;
    reports.dom = strokes.dom.stats.report();
    strokes.dom = null;
  }

  // Native events from Rust

  function onNative(e: PenEvent) {
    pendingLive.native = {
      type: e.source,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      buttons: e.button,
    };
    if (e.phase !== "move") logButton(`native ${e.phase} ${e.source} button=${e.button}`);
    if (e.source !== "pen" && e.source !== "eraser") return;

    const handledAt = performance.timeOrigin + performance.now();
    const sample = { time: e.time, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY };

    if (e.phase === "down" && e.button === 1) {
      strokes.native = { stats: new InputStats(), last: null };
    }
    const stroke = strokes.native;
    if (!stroke) return;
    stroke.stats.record([sample], handledAt, e.sentAt);
    drawTo("native", e.x, e.y, e.pressure);
    if (e.phase === "up" && e.button === 1) {
      reports.native = stroke.stats.report();
      strokes.native = null;
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    reports = { dom: null, native: null };
    buttonLog = [];
  }

  function reportText(): string {
    const lines = [
      `userAgent: ${navigator.userAgent}`,
      `devicePixelRatio: ${devicePixelRatio}`,
      ...Object.entries(support).map(([k, v]) => `${k}: ${v}`),
    ];
    for (const source of ["dom", "native"] as const) {
      const report = reports[source];
      if (!report) continue;
      lines.push(`--- ${source}`);
      for (const [k, v] of Object.entries(report)) {
        lines.push(`${k}: ${Number.isInteger(v) ? v : v.toFixed(3)}`);
      }
    }
    lines.push("--- buttons", ...buttonLog);
    return lines.join("\n");
  }

  async function copyReport() {
    try {
      // The webview's navigator.clipboard is not reliable, use the Tauri plugin there.
      await (native ? writeText(reportText()) : navigator.clipboard.writeText(reportText()));
      copyState = "Copied";
    } catch (err) {
      console.error(err);
      copyState = "Copy failed";
    }
    setTimeout(() => (copyState = null), 1500);
  }

  function resize() {
    const dpr = devicePixelRatio;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e8e8e8";
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!;
    resize();
    window.addEventListener("resize", resize);

    if (native) subscribeNativePen(onNative);

    // Update the live readout at most once per frame.
    let frame = requestAnimationFrame(function tick() {
      if (pendingLive.dom) live.dom = pendingLive.dom;
      if (pendingLive.native) live.native = pendingLive.native;
      delete pendingLive.dom;
      delete pendingLive.native;
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  });

  const fmt = (v: number, digits = 3) => v.toFixed(digits);
</script>

<div class="lab">
  <canvas
    bind:this={canvas}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    oncontextmenu={(e) => e.preventDefault()}
  ></canvas>

  <aside>
    <h2>Support</h2>
    <dl>
      {#each Object.entries(support) as [name, ok] (name)}
        <dt>{name}</dt>
        <dd class:ok class:ko={!ok}>{ok ? "yes" : "no"}</dd>
      {/each}
    </dl>

    {#if native}
      <h2>Draw with</h2>
      <div class="toggle">
        <button class:active={drawSource === "native"} onclick={() => (drawSource = "native")}>
          Native
        </button>
        <button class:active={drawSource === "dom"} onclick={() => (drawSource = "dom")}>
          DOM
        </button>
      </div>
    {/if}

    <h2>Live</h2>
    <dl class="cols">
      <dt></dt>
      <dd class="head">DOM</dd>
      <dd class="head">Native</dd>
      <dt>type</dt>
      <dd>{live.dom.type}</dd>
      <dd>{live.native.type}</dd>
      <dt>pressure</dt>
      <dd>{fmt(live.dom.pressure)}</dd>
      <dd>{fmt(live.native.pressure)}</dd>
      <dt>tilt X</dt>
      <dd>{fmt(live.dom.tiltX, 1)}</dd>
      <dd>{fmt(live.native.tiltX, 1)}</dd>
      <dt>tilt Y</dt>
      <dd>{fmt(live.dom.tiltY, 1)}</dd>
      <dd>{fmt(live.native.tiltY, 1)}</dd>
      <dt>buttons</dt>
      <dd>{live.dom.buttons}</dd>
      <dd>{live.native.buttons}</dd>
    </dl>

    <h2>Last stroke</h2>
    {#if reports.dom || reports.native}
      {@const d = reports.dom}
      {@const n = reports.native}
      <dl class="cols">
        <dt></dt>
        <dd class="head">DOM</dd>
        <dd class="head">Native</dd>
        <dt>samples</dt>
        <dd>{d?.samples ?? "-"}</dd>
        <dd>{n?.samples ?? "-"}</dd>
        <dt>per event</dt>
        <dd>{d ? fmt(d.samplesPerEvent, 2) : "-"}</dd>
        <dd>{n ? fmt(n.samplesPerEvent, 2) : "-"}</dd>
        <dt>rate (Hz)</dt>
        <dd>{d ? fmt(d.sampleRate, 0) : "-"}</dd>
        <dd>{n ? fmt(n.sampleRate, 0) : "-"}</dd>
        <dt>pressure min</dt>
        <dd>{d ? fmt(d.pressureMin) : "-"}</dd>
        <dd>{n ? fmt(n.pressureMin) : "-"}</dd>
        <dt>pressure max</dt>
        <dd>{d ? fmt(d.pressureMax) : "-"}</dd>
        <dd>{n ? fmt(n.pressureMax) : "-"}</dd>
        <dt>levels</dt>
        <dd>{d?.pressureLevels ?? "-"}</dd>
        <dd>{n?.pressureLevels ?? "-"}</dd>
        <dt>tilt max</dt>
        <dd>{d ? fmt(d.tiltMax, 1) : "-"}</dd>
        <dd>{n ? fmt(n.tiltMax, 1) : "-"}</dd>
        <dt>latency avg (ms)</dt>
        <dd>{d ? fmt(d.latencyAvg, 1) : "-"}</dd>
        <dd>{n ? fmt(n.latencyAvg, 1) : "-"}</dd>
        <dt>latency max (ms)</dt>
        <dd>{d ? fmt(d.latencyMax, 1) : "-"}</dd>
        <dd>{n ? fmt(n.latencyMax, 1) : "-"}</dd>
      </dl>
    {:else}
      <p class="hint">Draw a stroke on the left area.</p>
    {/if}

    <h2>Buttons</h2>
    <ul>
      {#each buttonLog as line, i (i)}
        <li>{line}</li>
      {:else}
        <li class="hint">Press the pen buttons.</li>
      {/each}
    </ul>

    <div class="actions">
      <button onclick={clear}>Clear</button>
      <button onclick={copyReport}>{copyState ?? "Copy report"}</button>
    </div>
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
    height: 100%;
  }

  canvas {
    flex: 1;
    min-width: 0;
    touch-action: none;
    cursor: crosshair;
  }

  aside {
    width: 300px;
    padding: 12px;
    overflow-y: auto;
    background: #26262a;
    border-left: 1px solid #333;
  }

  h2 {
    margin: 12px 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }

  dl.cols {
    grid-template-columns: auto 1fr 1fr;
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .head {
    color: #888;
  }

  .ok {
    color: #7c7;
  }

  .ko {
    color: #e77;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: monospace;
    font-size: 11px;
  }

  .hint {
    color: #777;
  }

  .toggle,
  .actions {
    display: flex;
    gap: 6px;
  }

  .actions {
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

  button.active {
    background: #3a4a66;
    border-color: #5a7ab0;
  }
</style>
