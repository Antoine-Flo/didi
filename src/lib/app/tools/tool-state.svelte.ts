// The tools as the user has them: the active one, every tool's settings and the current color,
// and which tools the tool column shows.

import { ERASER_TOOL, TOOL_BAR } from "#lib/app/tools/builtin.js";
import { applyPicked, pickerTool } from "#lib/app/tools/picker-tool.js";
import type {
  BrushCursor,
  Picked,
  Tool,
  ToolOptions,
  ToolRegistry,
  ToolSettings,
} from "#lib/app/tools/tool.js";

export class ToolState {
  /** The current color and the settings of every tool. */
  readonly options: ToolOptions;
  /** The tool used now. */
  readonly active: Tool;
  /** The tool column's tools, and the active one if it comes from elsewhere (e.g. Ctrl+K). */
  readonly inBar: Tool[];

  private activeId = $state("");
  private drawingId = $state("");

  constructor(readonly registry: ToolRegistry) {
    this.options = $state(registry.defaultOptions());
    this.id = TOOL_BAR[0];
    this.active = $derived(this.registry.get(this.activeId));
    this.inBar = $derived(
      [...TOOL_BAR, ...(TOOL_BAR.includes(this.activeId) ? [] : [this.activeId])]
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

  /** The tool the pen uses: its eraser end uses the pixel eraser. */
  forPen(eraser: boolean): Tool {
    return eraser ? this.registry.get(ERASER_TOOL) : this.active;
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
