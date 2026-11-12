import { describe, expect, it } from "vitest";
import type { RGB } from "#lib/core/color/color.js";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { fill, commandsOf } from "#lib/core/testing/test-utils.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { applyPicked, pickerTool } from "#lib/app/tools/picker-tool.js";
import type { Picked, ToolContext } from "#lib/app/tools/tool.js";

const RECT = { x: 0, y: 0, width: 4, height: 4 };

/** Two layers: half-transparent red below, and an active layer that is empty but for (1, 1). */
function setup() {
  const editor = new Editor(new Drawing(4, 4));
  commandsOf(editor).execute("layer.add");
  editor.drawing.writePixels(editor.activeLayer!.id, RECT, fill(RECT, [128, 0, 0, 128]));
  commandsOf(editor).execute("layer.add");
  const dot = { x: 1, y: 1, width: 1, height: 1 };
  editor.drawing.writePixels(editor.activeLayer!.id, dot, fill(dot, [0, 0, 255, 255]));
  return editor;
}

function pick(editor: Editor, source: string, channels: string, x: number, y: number) {
  let picked: Picked | null = null;
  const context = {
    editor,
    pick: (p: Picked) => (picked = p),
  } as unknown as ToolContext;
  pickerTool.begin(context, { source, channels }, { x, y, pressure: 1 });
  return picked as Picked | null;
}

describe("the color picker", () => {
  it("reads the visible canvas or the active layer", () => {
    const editor = setup();
    expect(pick(editor, "canvas", "color", 0, 0)?.color).toEqual([255, 0, 0]);
    expect(pick(editor, "canvas", "color", 1, 1)?.color).toEqual([0, 0, 255]);
    expect(pick(editor, "layer", "color", 1, 1)?.color).toEqual([0, 0, 255]);
  });

  it("takes the color, the opacity or both", () => {
    const editor = setup();
    const opacity = 128 / 255;
    expect(pick(editor, "canvas", "color", 0, 0)).toEqual({ color: [255, 0, 0] });
    expect(pick(editor, "canvas", "opacity", 0, 0)).toEqual({ opacity });
    expect(pick(editor, "canvas", "both", 0, 0)).toEqual({ color: [255, 0, 0], opacity });
  });

  it("takes no color from a transparent pixel", () => {
    // The active layer is empty there, whatever is visible below.
    const editor = setup();
    expect(pick(editor, "layer", "both", 0, 0)).toEqual({ color: null });
    expect(pick(editor, "layer", "color", 0, 0)).toEqual({ color: null });
    expect(pick(editor, "layer", "opacity", 0, 0)).toEqual({ opacity: 0 });
  });

  it("ignores points outside the canvas", () => {
    const editor = setup();
    expect(pick(editor, "canvas", "both", -1, 0)).toBeNull();
    expect(pick(editor, "canvas", "both", 4, 0)).toBeNull();
  });

  describe("previews the result of a click", () => {
    const current = { color: [1, 2, 3] as RGB, opacity: 0.5 };
    const preview = (editor: Editor, source: string, channels: string, x: number, y: number) =>
      pickerTool.preview!(editor, { source, channels }, { x, y }, current);

    it("with the color only: the current opacity is kept", () => {
      expect(preview(setup(), "canvas", "color", 1, 1)).toEqual({
        color: [0, 0, 255],
        opacity: 0.5,
      });
    });

    it("with the opacity only: the current color is kept", () => {
      expect(preview(setup(), "canvas", "opacity", 0, 0)).toEqual({
        color: [1, 2, 3],
        opacity: 128 / 255,
      });
    });

    it("with both", () => {
      expect(preview(setup(), "canvas", "both", 1, 1)).toEqual({ color: [0, 0, 255], opacity: 1 });
    });

    it("shows no color over a transparent pixel", () => {
      expect(preview(setup(), "layer", "both", 0, 0).color).toBeNull();
      expect(preview(setup(), "layer", "color", 0, 0).color).toBeNull();
      expect(preview(setup(), "layer", "opacity", 0, 0).opacity).toBe(0);
    });

    it("keeps the current color outside the canvas", () => {
      expect(preview(setup(), "canvas", "both", 9, 0)).toEqual(current);
    });
  });

  it("offers every choice it knows", () => {
    for (const field of pickerTool.fields ?? []) {
      if (field.kind === "choice") {
        expect(field.choices.length).toBeGreaterThan(1);
      }
    }
  });
});

describe("applyPicked", () => {
  it("sets the color and the opacity of the given tool, nothing else", () => {
    const options = createToolRegistry().defaultOptions();
    const fill = options.tools.fill.opacity;
    applyPicked(options, "pixel", { color: [1, 2, 3], opacity: 0.5 });
    expect(options.color).toEqual([1, 2, 3]);
    expect(options.tools.pixel.opacity).toBe(0.5);
    expect(options.tools.fill.opacity).toBe(fill);
  });

  it("leaves what was not picked", () => {
    const options = createToolRegistry().defaultOptions();
    const color = options.color;
    applyPicked(options, "pixel", { opacity: 0.25 });
    expect(options.color).toEqual(color);
    applyPicked(options, "pixel", { color: [9, 9, 9] });
    expect(options.tools.pixel.opacity).toBe(0.25);
  });

  it("can leave no color selected, keeping the opacity", () => {
    const options = createToolRegistry().defaultOptions();
    options.tools.pixel.opacity = 0.75;
    applyPicked(options, "pixel", { color: null });
    expect(options.color).toBeNull();
    expect(options.tools.pixel.opacity).toBe(0.75);
  });

  it("ignores the opacity for a tool without one", () => {
    const options = createToolRegistry().defaultOptions();
    applyPicked(options, "picker", { opacity: 0.5 });
    expect(options.tools.picker.opacity).toBeUndefined();
  });
});
