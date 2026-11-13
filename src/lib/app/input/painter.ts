// Connects pen input to the drawing tools: one painter per editor.
//
// Samples are in canvas pixels. The input side (DOM or native events) calls `begin`,
// `move` and `end`; the render loop calls `flush` once per frame. The painter checks the
// layer, then hands the samples to the active tool's stroke (see $lib/app/tools). `end`
// makes the stroke an undo step.

import type { Editor } from "#lib/core/editor/editor.js";
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
  /** Called with a message for the user, when a stroke cannot start. */
  onMessage(message: string): void;
  /** The keys held now. None by default. */
  modifiers?(): Modifiers;
}

const NO_MODIFIERS: Modifiers = { shift: false, ctrl: false, alt: false };

export class Painter {
  private stroke: ToolStroke | null = null;

  constructor(
    private editor: Editor,
    private readonly host: PainterHost,
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

  /** Whether a stroke is in progress. */
  get active(): boolean {
    return this.stroke !== null;
  }

  /**
   * Starts a stroke. `eraser` is true when the pen's eraser end is used.
   * Returns false if nothing was started (picker, no layer, locked or hidden layer).
   */
  begin(sample: Sample, eraser = false): boolean {
    if (this.active) {
      this.end();
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
    this.stroke.move(sample);
    return true;
  }

  move(samples: readonly Sample[]) {
    for (const s of samples) {
      this.stroke?.move(s);
    }
  }

  /** The pen is up: the stroke becomes an undo step, if it changed anything. */
  end() {
    const stroke = this.stroke;
    if (!stroke) {
      return;
    }
    this.stroke = null;
    const edit = stroke.finish();
    if (edit) {
      this.editor.history.push(edit);
    }
  }

  /** Abandons the stroke, leaving the layer as it was. */
  cancel() {
    const stroke = this.stroke;
    this.stroke = null;
    stroke?.cancel();
  }

  /** Shows the stroke's latest changes. Call once per frame. */
  flush() {
    this.stroke?.flush();
  }

  private refuse(message: string): false {
    this.host.onMessage(message);
    return false;
  }
}
