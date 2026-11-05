// The tools that come with Didi, registered like any other.

import { MYPAINT_TOOLS } from "./mypaint-tools";
import { fillTool } from "./fill-tool";
import { pickerTool } from "./picker-tool";
import { selectTool, smoothSelectTool } from "./select-tool";
import { ellipseTool, lineTool, rectangleTool } from "./shape-tools";
import { pixelBrushTool, pixelEraserTool } from "./pixel-tools";
import { ToolRegistry } from "./tool";

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
  for (const tool of BUILTIN_TOOLS) registry.register(tool);
  return registry;
}
