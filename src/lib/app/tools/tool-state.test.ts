import { describe, expect, it } from "vitest";
import { createToolRegistry, ERASER_TOOL, TOOL_BAR } from "#lib/app/tools/builtin.js";
import { ToolState } from "#lib/app/tools/tool-state.svelte.js";
import { defineTool } from "#lib/app/tools/tool.js";

const setup = () => new ToolState(createToolRegistry());

describe("ToolState", () => {
  it("starts on the first tool of the tool column, and shows its tools", () => {
    const tools = setup();
    expect(tools.id).toBe(TOOL_BAR[0]);
    expect(tools.active.id).toBe(TOOL_BAR[0]);
    expect(tools.inBar.map((t) => t.id)).toEqual(TOOL_BAR);
  });

  it("also shows the active tool when it is not in the tool column", () => {
    const registry = createToolRegistry();
    const extra = defineTool({
      id: "extra",
      title: "Extra",
      icon: registry.get("pixel").icon,
      defaults: {},
      cursor: () => ({ kind: "none" }),
      begin: () => null,
    });
    registry.register(extra);
    const tools = new ToolState(registry);
    tools.id = "extra";
    expect(tools.inBar.map((t) => t.id)).toEqual([...TOOL_BAR, "extra"]);
  });

  it("gives the pen's eraser end the pixel eraser", () => {
    const tools = setup();
    expect(tools.forPen(false).id).toBe(TOOL_BAR[0]);
    expect(tools.forPen(true).id).toBe(ERASER_TOOL);
  });

  it("picks for the tool drawn with, also once the picker is active", () => {
    const tools = setup();
    tools.id = "pixel";
    tools.options.tools.pixel.opacity = 1;
    tools.id = "picker";
    expect(tools.drawingTool).toBe("pixel");
    tools.pick({ color: [1, 2, 3], opacity: 0.5 });
    expect(tools.options.color).toEqual([1, 2, 3]);
    expect(tools.options.tools.pixel.opacity).toBe(0.5);
  });
});
