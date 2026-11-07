import { describe, expect, it } from "vitest";
import { Drawing } from "../document/drawing";
import { shapeFrom, shapeMask } from "../selection/shape";
import { Editor } from "./editor";

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

/** A 4 × 2 canvas, one layer: red on the left half, blue on the right. */
function setup() {
  const editor = new Editor(new Drawing(4, 2));
  editor.commands.execute("layer.add");
  const id = editor.activeLayer!.id;
  const data = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) data.set(i % 4 < 2 ? RED : BLUE, i * 4);
  editor.drawing.writePixels(id, { x: 0, y: 0, width: 4, height: 2 }, data);
  return { editor, id };
}

/** The color of each pixel of a row: "r", "b" or "." (transparent). */
function row(editor: Editor, id: string, y: number): string {
  const pixels = editor.drawing.getLayer(id).tiles.readRegion({ x: 0, y, width: 4, height: 1 });
  let out = "";
  for (let x = 0; x < 4; x++) {
    const [r, , b, a] = pixels.subarray(x * 4, x * 4 + 4);
    out += a === 0 ? "." : r > b ? "r" : "b";
  }
  return out;
}

describe("the select commands", () => {
  it("select the whole canvas", () => {
    const { editor } = setup();
    editor.commands.execute("selection.selectAll");
    expect(editor.selection.rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });
  });

  it("invert exactly, to the pixel, and back", () => {
    const { editor } = setup();
    editor.selection.set({ rect: { x: 0, y: 0, width: 1, height: 1 }, floating: null });
    editor.commands.execute("selection.invert");
    const { rect, shape } = editor.selection.state;
    expect(rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });
    expect([...shapeMask(rect!, shape!)]).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);

    editor.commands.execute("selection.invert");
    expect(editor.selection.state).toMatchObject({ rect: { x: 0, y: 0, width: 1, height: 1 } });
    expect(editor.selection.state.shape).toBeNull();
    editor.history.undo();
    expect(editor.selection.state.shape).toBe(shape);
  });

  it("invert nothing into everything, and everything into nothing", () => {
    const { editor } = setup();
    editor.commands.execute("selection.invert");
    expect(editor.selection.rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });
    editor.commands.execute("selection.invert");
    expect(editor.selection.rect).toBeNull();
  });
});

describe("the edit commands", () => {
  it("delete the selected pixels only, or the whole layer", () => {
    const { editor, id } = setup();
    const rect = { x: 1, y: 0, width: 2, height: 1 };
    editor.selection.set({ rect, floating: null });
    editor.commands.execute("edit.clear");
    expect(row(editor, id, 0)).toBe("r..b");
    expect(row(editor, id, 1)).toBe("rrbb");

    editor.selection.set({ rect: null, floating: null });
    editor.commands.execute("edit.clear");
    expect(row(editor, id, 1)).toBe("....");
    editor.history.undo();
    editor.history.undo();
    expect(row(editor, id, 0)).toBe("rrbb");
  });

  it("delete in a lasso only what it surrounds", () => {
    const { editor, id } = setup();
    const rect = { x: 0, y: 0, width: 4, height: 1 };
    const shape = shapeFrom(
      [
        { x: 0.5, y: 0.5 },
        { x: 1.5, y: 0.5 },
      ],
      rect,
    );
    editor.selection.set({ rect, shape, floating: null });
    editor.commands.execute("edit.clear");
    expect(row(editor, id, 0)).toBe("..bb");
  });

  it("refuse to delete on a locked or alpha-locked layer", () => {
    const { editor, id } = setup();
    editor.drawing.updateLayer(id, { alphaLocked: true });
    expect(editor.commands.isEnabled("edit.clear")).toBe(false);
    editor.drawing.updateLayer(id, { alphaLocked: false, locked: true });
    expect(editor.commands.isEnabled("edit.clear")).toBe(false);
    expect(editor.commands.isEnabled("edit.flipHorizontal")).toBe(false);
  });

  it("flip the whole layer, leaving no selection, as one undo step", () => {
    const { editor, id } = setup();
    editor.commands.execute("edit.flipHorizontal");
    expect(row(editor, id, 0)).toBe("bbrr");
    expect(editor.selection.rect).toBeNull();
    editor.history.undo();
    expect(row(editor, id, 0)).toBe("rrbb");
  });

  it("flip the selected pixels in place, floating", () => {
    const { editor, id } = setup();
    editor.selection.set({ rect: { x: 1, y: 0, width: 2, height: 2 }, floating: null });
    editor.commands.execute("edit.flipHorizontal");
    expect(row(editor, id, 0)).toBe("rbrb");
    expect(editor.selection.floating).not.toBeNull();
    editor.commands.execute("edit.flipHorizontal");
    expect(row(editor, id, 0)).toBe("rrbb");
  });

  it("copy the selected pixels, and paste them floating where they were", () => {
    const { editor, id } = setup();
    editor.selection.set({ rect: { x: 0, y: 0, width: 1, height: 1 }, floating: null });
    const image = editor.copyImage()!;
    expect(image.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect([...image.pixels]).toEqual(RED);

    editor.paste(image, { x: 3, y: 1 });
    expect(row(editor, id, 1)).toBe("rrbr");
    expect(editor.selection.floating).not.toBeNull();
    editor.history.undo();
    expect(row(editor, id, 1)).toBe("rrbb");
  });

  it("copy floating content as it is shown", () => {
    const { editor } = setup();
    editor.selection.set({ rect: { x: 0, y: 0, width: 2, height: 1 }, floating: null });
    editor.commands.execute("edit.flipHorizontal");
    expect([...editor.copyImage()!.pixels]).toEqual([...RED, ...RED]);
  });

  it("paste as a new layer, cut to the canvas", () => {
    const { editor } = setup();
    const before = editor.drawing.layers.length;
    const image = { width: 2, height: 1, pixels: new Uint8ClampedArray([...BLUE, ...RED]) };
    editor.pasteAsLayer(image, { x: 3, y: 0 });
    expect(editor.drawing.layers).toHaveLength(before + 1);
    expect(row(editor, editor.activeLayer!.id, 0)).toBe("...b");
    editor.history.undo();
    expect(editor.drawing.layers).toHaveLength(before);
  });

  it("lift the pixels to transform them, the whole layer without a selection", () => {
    const { editor, id } = setup();
    expect(editor.transform()).toBe(true);
    expect(editor.selection.floating?.layerId).toBe(id);
    expect(editor.selection.rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });
    expect(row(editor, id, 0)).toBe("rrbb");
  });

  it("lift only around what is drawn, and select a layer's content", () => {
    const { editor, id } = setup();
    editor.selection.set({ rect: { x: 1, y: 0, width: 3, height: 2 }, floating: null });
    editor.commands.execute("edit.clear");
    editor.selection.set({ rect: null, floating: null });
    expect(row(editor, id, 0)).toBe("r...");
    expect(editor.transform()).toBe(true);
    expect(editor.selection.rect).toEqual({ x: 0, y: 0, width: 1, height: 2 });
    editor.history.undo();

    expect(editor.selectLayerContent()).toBe(true);
    expect(editor.selection.state).toMatchObject({
      rect: { x: 0, y: 0, width: 1, height: 2 },
      shape: null,
    });
  });

  it("refuse to transform nothing", () => {
    const { editor } = setup();
    editor.commands.execute("edit.clear");
    expect(editor.transform()).toBe(false);
    expect(editor.selectLayerContent()).toBe(false);
  });
});
