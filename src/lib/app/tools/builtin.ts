// The tools that come with Didi, registered like any other.

import { MYPAINT_TOOLS } from "#lib/app/tools/mypaint-tools.js";
import { fillTool } from "#lib/app/tools/fill-tool.js";
import { pickerTool } from "#lib/app/tools/picker-tool.js";
import { selectTool, smoothSelectTool } from "#lib/app/tools/select-tool.js";
import { ellipseTool, lineTool, rectangleTool } from "#lib/app/tools/shape-tools.js";
import { pixelBrushTool, pixelEraserTool } from "#lib/app/tools/pixel-tools.js";
import { ToolRegistry } from "#lib/app/tools/tool.js";

export const BUILTIN_TOOLS = [
  ...MYPAINT_TOOLS,
  pixelBrushTool,
  pixelEraserTool,
  fillTool,
  lineTool,
  rectangleTool,
  ellipseTool,
  selectTool,
  smoothSelectTool,
  pickerTool,
];

/** A registry with the built-in tools. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool);
  }
  return registry;
}
