// The tools that come with Didi, registered like any other.

import { brushTool, eraserTool } from "./mypaint-tools";
import { pickerTool } from "./picker-tool";
import { pixelBrushTool, pixelEraserTool } from "./pixel-tools";
import { ToolRegistry } from "./tool";

export const BUILTIN_TOOLS = [brushTool, eraserTool, pixelBrushTool, pixelEraserTool, pickerTool];

/** A registry with the built-in tools. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of BUILTIN_TOOLS) registry.register(tool);
  return registry;
}
