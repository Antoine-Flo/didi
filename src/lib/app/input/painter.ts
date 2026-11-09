// Connects pen input to the drawing tools: one painter per editor.
//
// Samples are in canvas pixels. The input side (DOM or native events) calls `begin`,
// `move` and `end`; the render loop calls `flush` once per frame. The painter checks the
// layer, then hands the samples to the active tool's stroke (see $lib/app/tools). A stroke
// may still be painting after `end` (libmypaint brushes paint from a queue): it becomes an
// undo step once nothing is waiting.

import type { RGB } from "#lib/core/color/color.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { bundledBrush } from "#lib/mypaint/brushes.js";
import type { Brush, MyPaint } from "#lib/mypaint/engine.js";
import { pickerTool } from "#lib/app/tools/picker-tool.js";
import type {
  Modifiers,
  Picked,
  Sample,
  Tool,
  ToolContext,
  ToolOptions,
  ToolStroke,
} from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

export interface PainterHost {
  /** The tool to use. `eraser` is true when the pen's eraser end is down. */
  tool(eraser: boolean): Tool;
  options(): ToolOptions;
  /** Called with what was taken from the canvas, when using the picker. */
  onPick(picked: Picked): void;
  /** Called with the color of a stroke done with a tool that draws in color. */
  onPainted?(color: RGB): void;
  /** Called with a message for the user, when a stroke cannot start. */
  onMessage(message: string): void;
  /** The keys held now. None by default. */
  modifiers?(): Modifiers;
}

const NO_MODIFIERS: Modifiers = { shift: false, ctrl: false, alt: false };

export class Painter {
  private engine: MyPaint | null = null;
  private readonly brushes = new Map<string, Brush>();
  private stroke: ToolStroke | null = null;
  /** `end` was called: the stroke ends once nothing is waiting. */
  private ending = false;
  /** The color the stroke draws with, or null for tools without one (erasers, picker…). */
  private strokeColor: RGB | null = null;

  constructor(
    private editor: Editor,
    private readonly host: PainterHost,
    /** Clock for the frame budget, in milliseconds. */
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Paints in another document from now on. A stroke in progress is abandoned. */
  setEditor(editor: Editor) {
    if (editor === this.editor) {
      return;
    }
    if (this.active) {
      this.cancel();
    }
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
    const modifiers = () => this.host.modifiers?.() ?? NO_MODIFIERS;
    // Alt picks a color with any tool.
    const tool = modifiers().alt ? pickerTool : this.host.tool(eraser);
    const layer = this.editor.activeLayer;
    if (tool.needsLayer !== false) {
      if (!layer) {
        return this.refuse(m.canvas_no_layer_to_draw());
      }
      if (layer.locked) {
        return this.refuse(m.canvas_layer_locked({ name: layer.name }));
      }
      if (!layer.visible) {
        return this.refuse(m.canvas_layer_hidden({ name: layer.name }));
      }
    }
    const options = this.host.options();
    if (!options.color && tool.needsColor !== false) {
      return this.refuse(m.canvas_no_color());
    }
    // Drawing or changing a layer lays floating content down first.
    if (tool.needsLayer !== false) {
      this.editor.applySelection();
    }
    const context: ToolContext = {
      editor: this.editor,
      layer: layer ?? null,
      color: options.color ?? [0, 0, 0],
      engine: this.engine,
      brush: (preset) => this.brush(preset),
      now: this.now,
      modifiers,
      pick: (picked) => this.host.onPick(picked),
      refuse: (message) => {
        this.host.onMessage(message);
        return null;
      },
    };
    this.stroke = tool.begin(context, options.tools[tool.id] ?? { ...tool.defaults }, sample);
    if (!this.stroke) {
      return false;
    }
    this.ending = false;
    this.strokeColor = tool.needsColor !== false ? context.color : null;
    this.stroke.move(sample);
    return true;
  }

  move(samples: readonly Sample[]) {
    for (const s of samples) {
      this.stroke?.move(s);
    }
  }

  /** The pen is up. The stroke ends once it is fully painted (see `flush` and `drain`). */
  end() {
    if (!this.stroke) {
      return;
    }
    this.ending = true;
    if (!this.stroke.busy) {
      this.finish();
    }
  }

  /** Paints every waiting sample now, and finishes the stroke if the pen is up. */
  drain() {
    if (!this.stroke) {
      return;
    }
    this.stroke.drain();
    if (this.ending) {
      this.finish();
    }
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
    if (!this.stroke) {
      return;
    }
    this.stroke.flush(budgetMs);
    if (this.ending && !this.stroke.busy) {
      this.finish();
    }
  }

  private finish() {
    const stroke = this.stroke!;
    this.stroke = null;
    this.ending = false;
    const edit = stroke.finish();
    if (edit) {
      this.editor.history.push(edit);
      if (this.strokeColor) {
        this.host.onPainted?.(this.strokeColor);
      }
    }
  }

  /** The libmypaint brush for a bundled preset, created on first use. */
  private brush(preset: string): Brush {
    if (!this.engine) {
      throw new Error("The brush engine is not loaded");
    }
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
