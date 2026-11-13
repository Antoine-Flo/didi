import { describe, expect, it } from "vitest";
import { Pipette } from "@lucide/svelte";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import {
  defineTool,
  MAX_SIZE,
  MIN_SIZE,
  sizeFromSlider,
  sliderFromSize,
  ToolRegistry,
} from "#lib/app/tools/tool.js";

const dummy = (id: string) =>
  defineTool({
    id,
    title: id,
    icon: Pipette,
    defaults: { size: 3 },
    cursor: () => ({ kind: "none" }),
    begin: () => null,
  });

describe("ToolRegistry", () => {
  it("lists tools in registration order, and removes them", () => {
    const registry = new ToolRegistry();
    const removeA = registry.register(dummy("a"));
    registry.register(dummy("b"));
    expect(registry.list().map((t) => t.id)).toEqual(["a", "b"]);
    expect(() => registry.register(dummy("a"))).toThrow();
    removeA();
    expect(registry.has("a")).toBe(false);
    expect(() => registry.get("a")).toThrow();
    expect(registry.list().map((t) => t.id)).toEqual(["b"]);
  });

  it("gives each tool a copy of its default settings", () => {
    const registry = new ToolRegistry();
    const tool = dummy("a");
    registry.register(tool);
    const options = registry.defaultOptions();
    expect(options.tools.a).toEqual({ size: 3 });
    options.tools.a.size = 10;
    expect(tool.defaults.size).toBe(3);
  });

  it("has the built-in tools, with fields matching their settings", () => {
    const registry = createToolRegistry();
    expect(registry.list().map((t) => t.id)).toEqual([
      "pixel",
      "pixelEraser",
      "fill",
      "line",
      "rectangle",
      "ellipse",
      "select",
      "picker",
    ]);
    for (const tool of registry.list()) {
      for (const field of tool.fields ?? []) {
        expect(tool.defaults).toHaveProperty(field.key);
      }
      if (!tool.fields?.length) {
        expect(tool.hint).toBeTruthy();
      }
      if (tool.menu) {
        const values = tool.menu.items.map((i) => i.value);
        expect(values, tool.id).toContain(tool.defaults[tool.menu.key]);
      }
    }
  });
});

describe("size slider", () => {
  it("maps both ends and round-trips sizes", () => {
    expect(sizeFromSlider(0)).toBe(MIN_SIZE);
    expect(sizeFromSlider(1)).toBe(MAX_SIZE);
    for (const size of [1, 4.2, 20, 220]) {
      expect(sizeFromSlider(sliderFromSize(size))).toBe(size);
    }
  });
});
