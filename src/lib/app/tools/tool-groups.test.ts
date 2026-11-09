import { describe, expect, it } from "vitest";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { shownTool, toolEntries, type ToolEntry } from "#lib/app/tools/tool-groups.js";

const registry = createToolRegistry();
const tools = (ids: string[]) => ids.map((id) => registry.get(id)!);
const ids = (entries: ToolEntry[]) =>
  entries.map((e) => (e.kind === "tool" ? e.tool.id : e.tools.map((t) => t.id)));

describe("tool groups", () => {
  const pixel = ["pixel", "pixelEraser", "fill", "line", "rectangle", "ellipse", "select"];
  const painting = ["pencil", "ink", "brush", "eraser", "picker"];

  it("always groups the shapes, the line and brushes only when short", () => {
    expect(ids(toolEntries(tools(pixel), false))).toEqual([
      "pixel",
      "pixelEraser",
      "fill",
      "line",
      ["rectangle", "ellipse"],
      "select",
    ]);
    expect(ids(toolEntries(tools(pixel), true))).toEqual([
      "pixel",
      "pixelEraser",
      "fill",
      ["line", "rectangle", "ellipse"],
      "select",
    ]);
    expect(ids(toolEntries(tools(painting), false))).toEqual(painting);
    expect(ids(toolEntries(tools(painting), true))).toEqual([
      ["pencil", "ink", "brush"],
      "eraser",
      "picker",
    ]);
  });

  it("gives a group of one tool its own button", () => {
    expect(ids(toolEntries(tools(["rectangle", "pixel"]), false))).toEqual(["rectangle", "pixel"]);
  });

  it("shows the active tool, else the last used, else the first", () => {
    const shapes = tools(["line", "rectangle", "ellipse"]);
    expect(shownTool(shapes, "ellipse", "line").id).toBe("ellipse");
    expect(shownTool(shapes, "pixel", "rectangle").id).toBe("rectangle");
    expect(shownTool(shapes, "pixel").id).toBe("line");
  });
});
