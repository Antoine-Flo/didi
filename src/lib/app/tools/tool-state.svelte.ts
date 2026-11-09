// The tools as the user has them: the active one, every tool's settings and the current color,
// and which tools the mode shows. Each mode remembers its last tool: switching back finds it
// again.

import type { Mode } from "#lib/app/modes/mode.js";
import { applyPicked, pickerTool } from "./picker-tool";
import type { BrushCursor, Picked, Tool, ToolOptions, ToolRegistry, ToolSettings } from "./tool";

export class ToolState {
  /** The current color and the settings of every tool. */
  readonly options: ToolOptions;
  /** The tool used now. */
  readonly active: Tool;
  /** The mode's tools, and the active one if it comes from elsewhere (e.g. Ctrl+K). */
  readonly inBar: Tool[];

  private activeId = $state("");
  private drawingId = $state("");
  private mode: Mode;
  private readonly lastTool: Record<string, string> = {};

  constructor(
    readonly registry: ToolRegistry,
    mode: Mode,
  ) {
    this.options = $state(registry.defaultOptions());
    this.mode = $state.raw(mode);
    this.id = mode.tools[0];
    this.active = $derived(this.registry.get(this.activeId));
    this.inBar = $derived(
      [...this.mode.tools, ...(this.mode.tools.includes(this.activeId) ? [] : [this.activeId])]
        .filter((id) => this.registry.has(id))
        .map((id) => this.registry.get(id)),
    );
  }

  /** Id of the active tool. */
  get id(): string {
    return this.activeId;
  }

  set id(id: string) {
    this.activeId = id;
    if (id !== pickerTool.id) {
      this.drawingId = id;
    }
  }

  /** The tool picking serves: the active one, or the one in use before the picker. */
  get drawingTool(): string {
    return this.drawingId;
  }

  /** Shows another mode's tools, back on the last tool used in it. */
  setMode(mode: Mode) {
    if (mode.id === this.mode.id) {
      return;
    }
    this.lastTool[this.mode.id] = this.activeId;
    this.mode = mode;
    this.id = this.lastTool[mode.id] ?? mode.tools[0];
  }

  /** The tool the pen uses: its eraser end uses the mode's eraser. */
  forPen(eraser: boolean): Tool {
    return eraser ? this.registry.get(this.mode.eraserTool) : this.active;
  }

  /** A tool's settings now. */
  settings(tool: Tool): ToolSettings {
    return this.options.tools[tool.id] ?? tool.defaults;
  }

  /** The outline under the pen. */
  cursor(eraser: boolean): BrushCursor {
    const tool = this.forPen(eraser);
    return tool.cursor(this.settings(tool));
  }

  /** Applies what was taken from the canvas, to the tool drawn with. */
  pick(picked: Picked) {
    applyPicked(this.options, this.drawingId, picked);
  }
}
