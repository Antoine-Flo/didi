// Connects pen input to the drawing tools: one painter per editor.
//
// Samples are in canvas pixels. The input side (DOM or native events) calls `begin`,
// `move` and `end`; the render loop calls `flush` once per frame. The painter checks the
// layer, then hands the samples to the active tool's stroke (see $lib/app/tools). A stroke
// may still be painting after `end` (libmypaint brushes paint from a queue): it becomes an
// undo step once nothing is waiting.

import type { Editor } from "#lib/core/editor/editor.js";
import { bundledBrush } from "#lib/mypaint/brushes.js";
import type { Brush, MyPaint } from "#lib/mypaint/engine.js";
import type { RGB } from "#lib/core/color/color.js";
import type { Sample, Tool, ToolContext, ToolOptions, ToolStroke } from "#lib/app/tools/tool.js";

export interface PainterHost {
  /** The tool to use. `eraser` is true when the pen's eraser end is down. */
  tool(eraser: boolean): Tool;
  options(): ToolOptions;
  /** Called with the picked color, when using the picker. */
  onPick(color: RGB): void;
  /** Called with a message for the user, when a stroke cannot start. */
  onMessage(message: string): void;
}

export class Painter {
  private engine: MyPaint | null = null;
  private readonly brushes = new Map<string, Brush>();
  private stroke: ToolStroke | null = null;
  /** `end` was called: the stroke ends once nothing is waiting. */
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
    return this.stroke !== null;
  }

  /** The pen is up, but the stroke is still being painted from the queue. */
  get finishing(): boolean {
    return this.ending;
  }

  /**
   * Starts a stroke. `eraser` is true when the pen's eraser end is used.
   * Returns false if nothing was started (picker, no layer, locked or hidden layer).
   */
  begin(sample: Sample, eraser = false): boolean {
    if (this.active) {
      this.end();
      this.drain();
    }
    const tool = this.host.tool(eraser);
    const layer = this.editor.activeLayer;
    if (tool.needsLayer !== false) {
      if (!layer) return this.refuse("No layer: add one to draw.");
      if (layer.locked) return this.refuse(`Layer "${layer.name}" is locked.`);
      if (!layer.visible) return this.refuse(`Layer "${layer.name}" is hidden.`);
    }
    const options = this.host.options();
    const context: ToolContext = {
      editor: this.editor,
      layer: layer ?? null,
      color: options.color,
      engine: this.engine,
      brush: (preset) => this.brush(preset),
      now: this.now,
      pick: (color) => this.host.onPick(color),
      refuse: (message) => {
        this.host.onMessage(message);
        return null;
      },
    };
    this.stroke = tool.begin(context, options.tools[tool.id] ?? { ...tool.defaults }, sample);
    if (!this.stroke) return false;
    this.ending = false;
    this.stroke.move(sample);
    return true;
  }

  move(samples: readonly Sample[]) {
    for (const s of samples) this.stroke?.move(s);
  }

  /** The pen is up. The stroke ends once it is fully painted (see `flush` and `drain`). */
  end() {
    if (!this.stroke) return;
    this.ending = true;
    if (!this.stroke.busy) this.finish();
  }

  /** Paints every waiting sample now, and finishes the stroke if the pen is up. */
  drain() {
    if (!this.stroke) return;
    this.stroke.drain();
    if (this.ending) this.finish();
  }

  /** Abandons the stroke, leaving the layer as it was. */
  cancel() {
    const stroke = this.stroke;
    this.stroke = null;
    this.ending = false;
    stroke?.cancel();
  }

  /**
   * Paints waiting samples for about `budgetMs` (at least one), then shows the stroke's
   * latest changes. Call once per frame.
   */
  flush(budgetMs = 8) {
    if (!this.stroke) return;
    this.stroke.flush(budgetMs);
    if (this.ending && !this.stroke.busy) this.finish();
  }

  private finish() {
    const stroke = this.stroke!;
    this.stroke = null;
    this.ending = false;
    const edit = stroke.finish();
    if (edit) this.editor.history.push(edit);
  }

  /** The libmypaint brush for a bundled preset, created on first use. */
  private brush(preset: string): Brush {
    if (!this.engine) throw new Error("The brush engine is not loaded");
    let brush = this.brushes.get(preset);
    if (!brush) {
      brush = this.engine.createBrush(bundledBrush(preset).myb);
      this.brushes.set(preset, brush);
    }
    return brush;
  }

  private refuse(message: string): false {
    this.host.onMessage(message);
    return false;
  }
}
