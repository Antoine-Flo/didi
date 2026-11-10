<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { InputStats, type InputReport, type InputSample } from "#lib/lab/input-stats.js";
  import { subscribeNativePen, type PenEvent } from "#lib/platform/pen.js";
  import { detectSupport, reportText, type Live, type Source } from "#lib/lab/tablet-report.js";
  import TabletPanel from "#lib/lab/ui/TabletPanel.svelte";

  interface Stroke {
    stats: InputStats;
    last: { x: number; y: number } | null;
  }

  const native = isTauri();
  const support = detectSupport(native);

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
    if (!stroke) {
      return;
    }
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
      if (list.length > 0) {
        return list;
      }
    }
    return [e];
  }

  function domSample(e: PointerEvent): InputSample {
    return { time: e.timeStamp, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY };
  }

  function onDown(e: PointerEvent) {
    logButton(`dom down ${e.pointerType} button=${e.button} buttons=${e.buttons}`);
    if (e.button !== 0) {
      return;
    }
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
    if (!stroke) {
      return;
    }
    const samples = domSamples(e);
    stroke.stats.record(samples.map(domSample), performance.now(), e.timeStamp);
    for (const s of samples) {
      drawTo("dom", s.clientX, s.clientY, s.pressure);
    }
  }

  function onUp(e: PointerEvent) {
    logButton(`dom up   ${e.pointerType} button=${e.button} buttons=${e.buttons}`);
    if (!strokes.dom) {
      return;
    }
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
    if (e.phase !== "move") {
      logButton(`native ${e.phase} ${e.source} button=${e.button}`);
    }
    if (e.source !== "pen" && e.source !== "eraser") {
      return;
    }

    const handledAt = performance.timeOrigin + performance.now();
    const sample = { time: e.time, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY };

    if (e.phase === "down" && e.button === 1) {
      strokes.native = { stats: new InputStats(), last: null };
    }
    const stroke = strokes.native;
    if (!stroke) {
      return;
    }
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

  async function copyReport() {
    try {
      // The webview's navigator.clipboard is not reliable, use the Tauri plugin there.
      await (native
        ? writeText(reportText(support, reports, buttonLog))
        : navigator.clipboard.writeText(reportText(support, reports, buttonLog)));
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

    if (native) {
      void subscribeNativePen(onNative);
    }

    // Update the live readout at most once per frame.
    let frame = requestAnimationFrame(function tick() {
      if (pendingLive.dom) {
        live.dom = pendingLive.dom;
      }
      if (pendingLive.native) {
        live.native = pendingLive.native;
      }
      delete pendingLive.dom;
      delete pendingLive.native;
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  });
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

  <TabletPanel
    bind:drawSource
    {native}
    {support}
    {live}
    {reports}
    {buttonLog}
    {copyState}
    onclear={clear}
    oncopy={copyReport}
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

  canvas {
    flex: 1;
    min-width: 0;
    touch-action: none;
    cursor: crosshair;
  }
</style>
