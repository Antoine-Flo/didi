import { describe, expect, it } from "vitest";
import { newEditor } from "#lib/app/files/new-drawing.js";

describe("newEditor", () => {
  it("has a white background and an empty active layer above it, with no history", () => {
    const editor = newEditor(300, 200);
    const [background, layer] = editor.drawing.layers;
    expect(editor.drawing.layers.map((l) => l.name)).toEqual(["Background", "Layer 1"]);
    const all = { x: 0, y: 0, width: 300, height: 200 };
    expect(background.tiles.readRegion(all).every((v) => v === 255)).toBe(true);
    expect(layer.tiles.tileCount).toBe(0);
    expect(editor.activeLayer?.id).toBe(layer.id);
    expect(editor.history.canUndo).toBe(false);
  });

  it("has only an empty layer with a transparent background", () => {
    const editor = newEditor(16, 16, "transparent");
    expect(editor.drawing.layers.map((l) => l.name)).toEqual(["Layer 1"]);
    expect(editor.drawing.layers[0].tiles.tileCount).toBe(0);
    expect(editor.history.canUndo).toBe(false);
  });
});
