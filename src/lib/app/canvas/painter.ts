// Connects pen input to the drawing tools: one painter per editor.
//
// Brushes and erasers use libmypaint; the pixel tool draws whole pixels (pixel-perfect).
// Samples are in canvas pixels. The input side (DOM or native events) calls `begin`,
// `move` and `end`; the render loop calls `flush` once per frame.
//
// Like MyPaint, libmypaint brushes do not paint as samples arrive: samples wait in a queue,
// with their original times (so speed-based dynamics are unchanged), and each frame paints
// as many as fit in a time budget. A huge brush then lags behind the pen instead of
// freezing the interface. After `end`, the queue keeps draining over the next frames; the
// stroke becomes an undo step once it is fully painted.

import { PixelPathBuilder } from "#lib/core/brush/pixel-path.js";
import { StrokeRaster } from "#lib/core/brush/raster.js";
import { composite } from "#lib/core/compositing.js";
import type { Editor } from "#lib/core/editor.js";
import { unpremultiply } from "#lib/core/pixels.js";
import { bundledBrush } from "#lib/mypaint/brushes.js";
import { MyPaintStroke, type Brush, type MyPaint } from "#lib/mypaint/engine.js";
import type { RGB } from "#lib/core/color.js";
import type { ToolId, ToolOptions } from "./tools";

export interface Sample {
  x: number;
  y: number;
  /** 0 to 1. Mice report 1. */
  pressure: number;
  /** Degrees, -90 to 90. */
  tiltX?: number;
  tiltY?: number;
  /** Milliseconds, any origin, increasing. */
  time?: number;
  /** View zoom and rotation (degrees) when the sample was taken. */
  viewZoom?: number;
  viewRotation?: number;
}

export interface PainterHost {
  tool(): ToolId;
  options(): ToolOptions;
  /** Called with the picked color, when using the picker. */
  onPick(color: RGB): void;
  /** Called with a message for the user, when a stroke cannot start. */
  onMessage(message: string): void;
}

/**
 * Rough cost of painting a segment with libmypaint: its length times the brush size
 * (about 1 ms per 1000 on a fast machine). Longer segments are split, so that a frame
 * never waits long for a single sample: a huge brush moved fast would otherwise freeze.
 */
const MAX_SEGMENT_COST = 4000;

export class Painter {
  private engine: MyPaint | null = null;
  private readonly brushes = new Map<string, Brush>();
  private mypaint: MyPaintStroke | null = null;
  private pixels: { raster: StrokeRaster; path: PixelPathBuilder; size: number } | null = null;
  private lastTime: number | null = null;
  /** Samples with the same time as the previous one, waiting for a later time. */
  private sameTime: Sample[] = [];
  private lastSample: Sample | null = null;
  private firstSample: Sample | null = null;
  /** Farthest distance from the first sample, to tell taps from strokes. */
  private moved = 0;
  private label = "";
  /** Samples waiting to be painted by libmypaint. */
  private pending: Sample[] = [];
  /** Last sample put in the queue, and the brush size, to split long segments. */
  private lastQueued: Sample | null = null;
  private brushSize = 0;
  /** `end` was called: the stroke ends once the queue is empty. */
  private ending = false;

  constructor(
    private editor: Editor,
    private readonly host: PainterHost,
    /** Clock for the frame budget, in milliseconds. */
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Paints in another document from now on. A stroke in progress is abandoned. */
  setEditor(editor: Editor) {
    if (editor === this.editor) return;
    if (this.active) this.cancel();
    this.editor = editor;
  }

  /** Provides the brush engine, once loaded. */
  setEngine(engine: MyPaint) {
    this.engine = engine;
  }

  /** Whether a stroke is in progress, or still being painted. */
  get active(): boolean {
    return this.mypaint !== null || this.pixels !== null;
  }

  /** The pen is up, but the stroke is still being painted from the queue. */
  get finishing(): boolean {
    return this.ending;
  }

  /**
   * Starts a stroke. `eraser` is true when the pen's eraser end is used, whatever the tool.
   * Returns false if nothing was started (picker, no layer, locked or hidden layer).
   */
  begin(sample: Sample, eraser = false): boolean {
    if (this.active) {
      this.end();
      this.drain();
    }
    const tool = eraser ? "eraser" : this.host.tool();
    if (tool === "picker") {
      this.pick(sample);
      return false;
    }
    const layer = this.editor.activeLayer;
    if (!layer) return this.refuse("No layer: add one to draw.");
    if (layer.locked) return this.refuse(`Layer "${layer.name}" is locked.`);
    if (!layer.visible) return this.refuse(`Layer "${layer.name}" is hidden.`);

    const options = this.host.options();
    if (tool === "pixel") {
      const { size, opacity, pixelPerfect } = options.pixel;
      const rounded = Math.max(1, Math.round(size));
      this.pixels = {
        raster: new StrokeRaster(this.editor.drawing, layer.id, {
          color: options.color,
          opacity,
          mode: "paint",
        }),
        path: new PixelPathBuilder(pixelPerfect && rounded === 1),
        size: rounded,
      };
      this.label = "Pixel brush";
    } else {
      if (!this.engine) return this.refuse("The brush engine is loading, try again.");
      const settings = tool === "eraser" ? options.eraser : options.brush;
      const brush = this.brush(settings.preset);
      brush.size = settings.size;
      this.brushSize = settings.size;
      brush.setColor(options.color);
      this.mypaint = new MyPaintStroke(
        this.engine,
        brush,
        this.editor.drawing,
        layer.id,
        settings.opacity,
      );
      this.mypaint.view = { zoom: sample.viewZoom ?? 1, rotation: sample.viewRotation ?? 0 };
      this.mypaint.moveTo(sample.x, sample.y, sample.tiltX, sample.tiltY);
      this.label = tool === "eraser" ? "Eraser" : "Brush";
    }
    this.lastTime = null;
    this.lastQueued = null;
    this.sameTime = [];
    this.firstSample = sample;
    this.moved = 0;
    this.move([sample]);
    return true;
  }

  move(samples: readonly Sample[]) {
    for (const s of samples) {
      this.lastSample = s;
      if (this.firstSample) {
        this.moved = Math.max(
          this.moved,
          Math.hypot(s.x - this.firstSample.x, s.y - this.firstSample.y),
        );
      }
      if (this.pixels) {
        const { raster, path, size } = this.pixels;
        const { paint, unpaint } = path.add(s.x, s.y);
        raster.setPixels(unpaint, size, false);
        raster.setPixels(paint, size, true);
      } else if (this.mypaint) {
        this.enqueue(s);
      }
    }
  }

  /** Puts a sample in the queue, after splitting a long segment from the previous one. */
  private enqueue(s: Sample) {
    const prev = this.lastQueued;
    if (prev) {
      const length = Math.hypot(s.x - prev.x, s.y - prev.y);
      const parts = Math.ceil((length * this.brushSize) / MAX_SEGMENT_COST);
      for (let i = 1; i < parts; i++) this.pending.push(between(prev, s, i / parts));
    }
    this.pending.push(s);
    this.lastQueued = s;
  }

  /**
   * Sends a sample to libmypaint. Like MyPaint, samples sharing the same timestamp (events
   * often have a 1 ms resolution) wait for the next later sample, and their times are then
   * spread evenly in between: otherwise the brush would see an infinite speed.
   */
  private queue(s: Sample) {
    if (s.time === undefined || this.lastTime === null) {
      this.send(s, s.time);
      return;
    }
    if (s.time <= this.lastTime) {
      this.sameTime.push(s);
      return;
    }
    if (this.sameTime.length > 0) {
      const interval = Math.min(s.time - this.lastTime, 100);
      const step = interval / (this.sameTime.length + 1);
      let time = s.time - interval;
      for (const waiting of this.sameTime) this.send(waiting, (time += step));
      this.sameTime = [];
    }
    this.send(s, s.time);
  }

  private send(s: Sample, time: number | undefined) {
    const dtime =
      time !== undefined && this.lastTime !== null ? (time - this.lastTime) / 1000 : 1 / 120;
    if (time !== undefined) this.lastTime = time;
    this.mypaint!.view = { zoom: s.viewZoom ?? 1, rotation: s.viewRotation ?? 0 };
    this.mypaint!.strokeTo(s.x, s.y, s.pressure, s.tiltX ?? 0, s.tiltY ?? 0, dtime);
  }

  /**
   * The pen is up. A pixel stroke ends now; a libmypaint stroke ends once its queue is
   * painted (see `flush` and `drain`). Either way it then becomes one undo step.
   */
  end() {
    if (this.pixels) this.finish();
    else if (this.mypaint) {
      this.ending = true;
      if (this.pending.length === 0) this.finish();
    }
  }

  /** Paints every waiting sample now, and finishes the stroke if the pen is up. */
  drain() {
    if (!this.mypaint) return;
    for (const s of this.pending) this.queue(s);
    this.pending = [];
    if (this.ending) this.finish();
  }

  private finish() {
    this.ending = false;
    // Samples still waiting for a later time: give them 1 ms each.
    if (this.mypaint && this.lastTime !== null) {
      for (const waiting of this.sameTime) this.send(waiting, this.lastTime + 1);
    }
    this.sameTime = [];
    // A tap (no movement): mark the point, since libmypaint only paints along a movement.
    const last = this.lastSample;
    if (this.mypaint && last && this.moved < 1) {
      this.mypaint.tap(last.x, last.y, Math.max(last.pressure, 0.3), last.tiltX, last.tiltY);
    }
    const stroke = this.mypaint ?? this.pixels?.raster;
    if (!stroke) return;
    this.mypaint = null;
    this.pixels = null;
    const edit = stroke.finish(this.label);
    if (edit) this.editor.history.push(edit);
  }

  /** Abandons the stroke, leaving the layer as it was. */
  cancel() {
    this.pending = [];
    this.ending = false;
    const stroke = this.mypaint ?? this.pixels?.raster;
    this.mypaint = null;
    this.pixels = null;
    stroke?.cancel();
  }

  /**
   * Paints waiting samples for about `budgetMs` (at least one), then shows the stroke's
   * latest changes. Call once per frame.
   */
  flush(budgetMs = 8) {
    if (this.mypaint) {
      const start = this.now();
      let done = 0;
      while (done < this.pending.length) {
        this.queue(this.pending[done++]);
        if (this.now() - start >= budgetMs) break;
      }
      this.pending.splice(0, done);
      if (this.ending && this.pending.length === 0) this.finish();
      else this.mypaint.flush();
    }
    this.pixels?.raster.flush();
  }

  /** The libmypaint brush for a bundled preset, created on first use. */
  private brush(preset: string): Brush {
    let brush = this.brushes.get(preset);
    if (!brush) {
      brush = this.engine!.createBrush(bundledBrush(preset).myb);
      this.brushes.set(preset, brush);
    }
    return brush;
  }

  private pick({ x, y }: Sample) {
    const { drawing } = this.editor;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= drawing.width || py >= drawing.height) return;
    const [r, g, b, a] = unpremultiply(composite(drawing, { x: px, y: py, width: 1, height: 1 }));
    if (a > 0) this.host.onPick([r, g, b]);
  }

  private refuse(message: string): false {
    this.host.onMessage(message);
    return false;
  }
}

/** The sample at `t` (0 to 1) on the way from `a` to `b`. */
function between(a: Sample, b: Sample, t: number): Sample {
  const mix = (x: number | undefined, y: number | undefined) =>
    x === undefined || y === undefined ? y : x + (y - x) * t;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
    tiltX: mix(a.tiltX ?? 0, b.tiltX ?? 0),
    tiltY: mix(a.tiltY ?? 0, b.tiltY ?? 0),
    time: mix(a.time, b.time),
    viewZoom: b.viewZoom,
    viewRotation: b.viewRotation,
  };
}
