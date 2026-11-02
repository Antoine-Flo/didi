// The tools that come with Didi, registered like any other.

import { MYPAINT_TOOLS } from "./mypaint-tools";
import { pickerTool } from "./picker-tool";
import { pixelBrushTool, pixelEraserTool } from "./pixel-tools";
import { ToolRegistry } from "./tool";

export const BUILTIN_TOOLS = [...MYPAINT_TOOLS, pixelBrushTool, pixelEraserTool, pickerTool];

/** A registry with the built-in tools. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of BUILTIN_TOOLS) registry.register(tool);
  return registry;
}
