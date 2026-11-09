import { describe, expect, it } from "vitest";
import { createModeRegistry } from "#lib/app/modes/builtin.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { ToolState } from "#lib/app/tools/tool-state.svelte.js";

const modes = createModeRegistry();
const pixel = modes.get("pixel");
const painting = modes.get("painting");

const setup = () => new ToolState(createToolRegistry(), pixel);

describe("ToolState", () => {
  it("starts on the mode's first tool, and shows the mode's tools", () => {
    const tools = setup();
    expect(tools.id).toBe(pixel.tools[0]);
    expect(tools.active.id).toBe(pixel.tools[0]);
    expect(tools.inBar.map((t) => t.id)).toEqual(pixel.tools);
  });

  it("also shows the active tool when it comes from another mode", () => {
    const tools = setup();
    tools.id = painting.tools[0];
    expect(pixel.tools).not.toContain(tools.id);
    expect(tools.inBar.map((t) => t.id)).toEqual([...pixel.tools, painting.tools[0]]);
  });

  it("finds each mode's last tool again when switching back", () => {
    const tools = setup();
    tools.id = "fill";
    tools.setMode(painting);
    expect(tools.id).toBe(painting.tools[0]);
    tools.id = painting.tools[1];
    tools.setMode(pixel);
    expect(tools.id).toBe("fill");
    tools.setMode(painting);
    expect(tools.id).toBe(painting.tools[1]);
  });

  it("keeps the tool when the mode does not change", () => {
    const tools = setup();
    tools.id = "fill";
    tools.setMode(pixel);
    expect(tools.id).toBe("fill");
  });

  it("gives the pen's eraser end the mode's eraser", () => {
    const tools = setup();
    expect(tools.forPen(false).id).toBe(pixel.tools[0]);
    expect(tools.forPen(true).id).toBe(pixel.eraserTool);
    tools.setMode(painting);
    expect(tools.forPen(true).id).toBe(painting.eraserTool);
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
