import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

const CANVAS = { x: 0, y: 0, width: 2, height: 1 };

/** A 2 × 1 canvas, layers named after their two pixels' alpha. */
function setup(...layers: [number, number][]) {
  const editor = new Editor(new Drawing(2, 1));
  for (const [a, b] of layers) {
    commandsOf(editor).execute("layer.add", { props: { name: `${a},${b}` } });
    const pixels = new Uint8ClampedArray([a, 0, 0, a, b, 0, 0, b]);
    editor.drawing.writePixels(editor.activeLayer!.id, CANVAS, pixels);
  }
  return editor;
}

const alphas = (editor: Editor, index: number) => {
  const pixels = editor.drawing.layers[index].tiles.readRegion(CANVAS);
  return [pixels[3], pixels[7]];
};
const names = (editor: Editor) => editor.drawing.layers.map((l) => l.name);

describe("the layer commands", () => {
  it("duplicate a layer above it, with its pixels, and select the copy", () => {
    const editor = setup([255, 0]);
    editor.drawing.updateLayer(editor.activeLayer!.id, { opacity: 0.5 });
    commandsOf(editor).execute("layer.duplicate");
    expect(names(editor)).toEqual(["255,0", "255,0 copy"]);
    expect(editor.activeLayer!.name).toBe("255,0 copy");
    expect(editor.activeLayer!.opacity).toBe(0.5);
    expect(alphas(editor, 1)).toEqual([255, 0]);
    editor.history.undo();
    expect(names(editor)).toEqual(["255,0"]);
  });

  it("merge a layer down, with its opacity, as one step", () => {
    const editor = setup([0, 255], [255, 0]);
    editor.drawing.updateLayer(editor.activeLayer!.id, { opacity: 0.5 });
    commandsOf(editor).execute("layer.mergeDown");
    expect(names(editor)).toEqual(["0,255"]);
    expect(alphas(editor, 0)).toEqual([128, 255]);
    expect(editor.activeLayer!.name).toBe("0,255");
    editor.history.undo();
    expect(names(editor)).toEqual(["0,255", "255,0"]);
    expect(alphas(editor, 0)).toEqual([0, 255]);
  });

  it("don't merge the bottom layer, a hidden one, or into a locked one", () => {
    const editor = setup([0, 255], [255, 0]);
    const [below, top] = editor.drawing.layers;
    expect(commandsOf(editor).isEnabled("layer.mergeDown", { id: below.id })).toBe(false);
    editor.drawing.updateLayer(top.id, { visible: false });
    expect(commandsOf(editor).isEnabled("layer.mergeDown")).toBe(false);
    editor.drawing.updateLayer(top.id, { visible: true });
    editor.drawing.updateLayer(below.id, { locked: true });
    expect(commandsOf(editor).isEnabled("layer.mergeDown")).toBe(false);
  });

  it("flatten the visible layers into one, dropping the hidden ones", () => {
    const editor = setup([0, 255], [255, 0], [255, 255]);
    editor.drawing.updateLayer(editor.activeLayer!.id, { visible: false });
    commandsOf(editor).execute("layer.flatten");
    expect(names(editor)).toEqual(["0,255"]);
    expect(alphas(editor, 0)).toEqual([255, 255]);
    editor.history.undo();
    expect(names(editor)).toEqual(["0,255", "255,0", "255,255"]);
  });

  it("clear and flip a whole layer, whatever is selected", () => {
    const editor = setup([255, 0]);
    commandsOf(editor).execute("selection.selectAll");
    editor.selection.set({ rect: { x: 1, y: 0, width: 1, height: 1 }, floating: null });
    commandsOf(editor).execute("layer.flipHorizontal");
    expect(alphas(editor, 0)).toEqual([0, 255]);
    commandsOf(editor).execute("layer.clear");
    expect(alphas(editor, 0)).toEqual([0, 0]);
    editor.history.undo();
    editor.history.undo();
    expect(alphas(editor, 0)).toEqual([255, 0]);
  });

  it("lay floating content first, in the same step", () => {
    const editor = setup([255, 0]);
    editor.selection.set({ rect: { x: 0, y: 0, width: 1, height: 1 }, floating: null });
    editor.transform();
    expect(editor.selection.floating).not.toBeNull();
    const steps = editor.history.undoLabel;
    commandsOf(editor).execute("layer.clear");
    expect(editor.selection.floating).toBeNull();
    editor.history.undo();
    expect(editor.selection.floating).not.toBeNull();
    expect(editor.history.undoLabel).toBe(steps);
  });
});
