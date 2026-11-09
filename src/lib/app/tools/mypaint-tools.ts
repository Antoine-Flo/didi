// Painting tools: pencil, ink, brush, eraser… Each one offers a set of libmypaint brushes
// (see $lib/mypaint/brush-sets) and remembers the last one chosen.
//
// Like MyPaint, libmypaint brushes do not paint as samples arrive: samples wait in a queue,
// with their original times (so speed-based dynamics are unchanged), and each frame paints
// as many as fit in a time budget. A huge brush then lags behind the pen instead of
// freezing the interface. After the pen is lifted, the queue keeps draining over the next
// frames; the stroke becomes an undo step once it is fully painted.

import {
  Blend,
  Brush as BrushIcon,
  Droplet,
  Eraser as EraserIcon,
  PenTool,
  PencilLine,
  Sparkles,
  SprayCan,
} from "@lucide/svelte";
import { brushSet } from "#lib/mypaint/brush-sets.js";
import { bundledBrush } from "#lib/mypaint/brushes.js";
import { selectionClip } from "#lib/core/selection/selection.js";
import { MyPaintStroke } from "#lib/mypaint/stroke.js";
import {
  defineTool,
  stepSize,
  type Sample,
  type Tool,
  type ToolContext,
  type ToolGroup,
  type ToolStroke,
} from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

export type MyPaintSettings = {
  /** Bundled MyPaint brush id (see $lib/mypaint/brushes). */
  preset: string;
  /** Largest diameter in canvas pixels, at the pressure that makes the brush largest. */
  size: number;
  /** Multiplies the brush's own opacity, 0 to 1. */
  opacity: number;
};

/**
 * Rough cost of painting a segment with libmypaint: its length times the brush size
 * (about 1 ms per 1000 on a fast machine). Longer segments are split, so that a frame
 * never waits long for a single sample: a huge brush moved fast would otherwise freeze.
 */
const MAX_SEGMENT_COST = 4000;

/**
 * A tool for the brush set with the same id, starting with the set's first brush.
 * `pigment: false` paints with normal color mixing instead of libmypaint's pigment mode
 * (spectral mixing, which is much slower where the layer already has color).
 */
function mypaintTool(id: string, title: string, icon: Tool["icon"], pigment = true): Tool {
  const preset = brushSet(id).picks[0];
  return defineTool<MyPaintSettings>({
    id,
    title,
    icon,
    brushSet: id,
    defaults: { preset, size: bundledBrush(preset).nativeSize, opacity: 1 },
    fields: [
      { kind: "size", key: "size", label: m.tool_size() },
      { kind: "percent", key: "opacity", label: m.tool_opacity() },
    ],
    cursor: (s) => ({ kind: "circle", size: s.size }),
    resize: (s, direction) => (s.size = stepSize(s.size, direction)),
    begin(context, settings, sample) {
      if (!context.engine) {
        return context.refuse(m.tool_engine_loading());
      }
      return new QueuedStroke(context, settings, sample, title, pigment);
    },
  });
}

/** The painting brushes share a button when the tool column does not fit. */
export const BRUSHES: ToolGroup = { id: "brushes", title: m.tool_group_brushes() };
const brushes = { group: BRUSHES, whenShort: true };

export const MYPAINT_TOOLS = [
  { ...mypaintTool("pencil", m.tool_pencil(), PencilLine), group: brushes },
  { ...mypaintTool("ink", m.tool_ink(), PenTool), group: brushes },
  { ...mypaintTool("brush", m.tool_brush(), BrushIcon), group: brushes },
  { ...mypaintTool("watercolor", m.tool_watercolor(), Droplet), group: brushes },
  // Normal mixing: an airbrush lays many light, large dabs over existing color, where
  // pigment mode costs the most, and the difference in look is slight.
  { ...mypaintTool("airbrush", m.tool_airbrush(), SprayCan, false), group: brushes },
  { ...mypaintTool("blend", m.tool_blend(), Blend), group: brushes },
  { ...mypaintTool("texture", m.tool_texture(), Sparkles), group: brushes },
  { ...mypaintTool("eraser", m.tool_eraser(), EraserIcon), needsColor: false },
];

class QueuedStroke implements ToolStroke {
  private readonly stroke: MyPaintStroke;
  private readonly size: number;
  private readonly now: () => number;
  private lastTime: number | null = null;
  /** Samples with the same time as the previous one, waiting for a later time. */
  private sameTime: Sample[] = [];
  /** Samples waiting to be painted. */
  private pending: Sample[] = [];
  /** Last sample put in the queue, to split long segments. */
  private lastQueued: Sample | null = null;
  private readonly first: Sample;
  private last: Sample;
  /** Farthest distance from the first sample, to tell taps from strokes. */
  private moved = 0;

  constructor(
    context: ToolContext,
    settings: MyPaintSettings,
    sample: Sample,
    private readonly label: string,
    pigment: boolean,
  ) {
    const brush = context.brush(settings.preset);
    // Brushes are shared between tools: set the mixing mode for each stroke. libmypaint's
    // default is full pigment mode.
    const own = bundledBrush(settings.preset).myb.settings.paint_mode?.base_value ?? 1;
    brush.set("paint_mode", pigment ? own : 0);
    // libmypaint's size is the base diameter, which pressure and other inputs then change:
    // the size set is the diameter painted at full pressure.
    brush.size = settings.size / bundledBrush(settings.preset).sizeFactor;
    brush.setColor(context.color);
    this.size = settings.size;
    this.now = context.now;
    this.stroke = new MyPaintStroke(
      context.engine!,
      brush,
      context.editor.drawing,
      context.layer!.id,
      settings.opacity,
      selectionClip(context.editor.selection.state),
    );
    this.stroke.view = { zoom: sample.viewZoom ?? 1, rotation: sample.viewRotation ?? 0 };
    this.stroke.moveTo(sample.x, sample.y, sample.tiltX, sample.tiltY);
    this.first = this.last = sample;
  }

  get busy(): boolean {
    return this.pending.length > 0;
  }

  move(s: Sample) {
    this.last = s;
    this.moved = Math.max(this.moved, Math.hypot(s.x - this.first.x, s.y - this.first.y));
    // Split a long segment from the previous sample.
    const prev = this.lastQueued;
    if (prev) {
      const length = Math.hypot(s.x - prev.x, s.y - prev.y);
      const parts = Math.ceil((length * this.size) / MAX_SEGMENT_COST);
      for (let i = 1; i < parts; i++) {
        this.pending.push(between(prev, s, i / parts));
      }
    }
    this.pending.push(s);
    this.lastQueued = s;
  }

  flush(budgetMs: number) {
    const start = this.now();
    let done = 0;
    while (done < this.pending.length) {
      this.queue(this.pending[done++]);
      if (this.now() - start >= budgetMs) {
        break;
      }
    }
    this.pending.splice(0, done);
    this.stroke.flush();
  }

  drain() {
    for (const s of this.pending) {
      this.queue(s);
    }
    this.pending = [];
  }

  finish() {
    // Samples still waiting for a later time: give them 1 ms each.
    if (this.lastTime !== null) {
      for (const waiting of this.sameTime) {
        this.send(waiting, this.lastTime + 1);
      }
    }
    this.sameTime = [];
    // A tap (no movement): mark the point, since libmypaint only paints along a movement.
    const last = this.last;
    if (this.moved < 1) {
      this.stroke.tap(last.x, last.y, Math.max(last.pressure, 0.3), last.tiltX, last.tiltY);
    }
    return this.stroke.finish(this.label);
  }

  cancel() {
    this.pending = [];
    this.stroke.cancel();
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
      for (const waiting of this.sameTime) {
        this.send(waiting, (time += step));
      }
      this.sameTime = [];
    }
    this.send(s, s.time);
  }

  private send(s: Sample, time: number | undefined) {
    const dtime =
      time !== undefined && this.lastTime !== null ? (time - this.lastTime) / 1000 : 1 / 120;
    if (time !== undefined) {
      this.lastTime = time;
    }
    this.stroke.view = { zoom: s.viewZoom ?? 1, rotation: s.viewRotation ?? 0 };
    this.stroke.strokeTo(s.x, s.y, s.pressure, s.tiltX ?? 0, s.tiltY ?? 0, dtime);
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
