// The tools that come with Didi, registered like any other.

import { fillTool } from "#lib/app/tools/fill-tool.js";
import { pickerTool } from "#lib/app/tools/picker-tool.js";
import { selectTool } from "#lib/app/tools/select-tool.js";
import { ellipseTool, lineTool, rectangleTool } from "#lib/app/tools/shape-tools.js";
import { pixelBrushTool, pixelEraserTool } from "#lib/app/tools/pixel-tools.js";
import { ToolRegistry } from "#lib/app/tools/tool.js";

export const BUILTIN_TOOLS = [
  pixelBrushTool,
  pixelEraserTool,
  fillTool,
  lineTool,
  rectangleTool,
  ellipseTool,
  selectTool,
  pickerTool,
];

/** Tool ids of the tool column, in order. The first one is active at start. */
export const TOOL_BAR: readonly string[] = [
  "pixel",
  "pixelEraser",
  "fill",
  "line",
  "rectangle",
  "ellipse",
  "select",
  "picker",
];

/** The tool of the pen's eraser end. */
export const ERASER_TOOL = "pixelEraser";

/** A registry with the built-in tools. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool);
  }
  return registry;
}
