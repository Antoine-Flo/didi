import { describe, expect, it } from "vitest";
import { Drawing } from "../document/drawing";
import { Editor } from "./editor";

/**
 * A canvas from rows of letters, one layer: "r" red, "b" blue, "." transparent. Pixels are
 * read back the same way, so a test shows the image.
 */
function setup(...rows: string[]) {
  const width = rows[0].length;
  const height = rows.length;
  const editor = new Editor(new Drawing(width, height));
  editor.commands.execute("layer.add");
  const data = new Uint8ClampedArray(width * height * 4);
  [...rows.join("")].forEach((c, i) => {
    if (c === "r") {
      data.set([255, 0, 0, 255], i * 4);
    }
    if (c === "b") {
      data.set([0, 0, 255, 255], i * 4);
    }
  });
  editor.drawing.writePixels(editor.activeLayer!.id, { x: 0, y: 0, width, height }, data);
  return editor;
}

function image(editor: Editor): string[] {
  const { width, height } = editor.drawing;
  const data = editor.activeLayer!.tiles.readRegion({ x: 0, y: 0, width, height });
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const i = (y * width + x) * 4;
      return data[i + 3] === 0 ? "." : data[i] > data[i + 2] ? "r" : "b";
    }).join(""),
  );
}

describe("the image commands", () => {
  it("resize the canvas around the pixels, as one undo step", () => {
    const editor = setup("rb", "br");
    editor.commands.execute("image.resizeCanvas", { width: 3, height: 1, dx: 1, dy: 0 });
    expect(image(editor)).toEqual([".rb"]);
    editor.history.undo();
    expect(image(editor)).toEqual(["rb", "br"]);
    editor.history.redo();
    expect(image(editor)).toEqual([".rb"]);
  });

  it("crop to the selection, and remove it", () => {
    const editor = setup("rbr", "bbb");
    editor.selection.set({ rect: { x: 1, y: 0, width: 2, height: 1 }, floating: null });
    editor.commands.execute("image.cropToSelection");
    expect(image(editor)).toEqual(["br"]);
    expect(editor.selection.rect).toBeNull();
    editor.history.undo();
    expect(editor.selection.rect).toEqual({ x: 1, y: 0, width: 2, height: 1 });
  });

  it("trim to what is drawn", () => {
    const editor = setup("...", ".r.", "..b");
    editor.commands.execute("image.trim");
    expect(image(editor)).toEqual(["r.", ".b"]);
  });

  it("rotate by quarter turns, and flip", () => {
    const editor = setup("rb", "..");
    editor.commands.execute("image.rotateRight");
    expect(image(editor)).toEqual([".r", ".b"]);
    editor.commands.execute("image.rotateLeft");
    expect(image(editor)).toEqual(["rb", ".."]);
    editor.commands.execute("image.rotate180");
    expect(image(editor)).toEqual(["..", "br"]);
    editor.commands.execute("image.flipHorizontal");
    expect(image(editor)).toEqual(["..", "rb"]);
    editor.commands.execute("image.flipVertical");
    expect(image(editor)).toEqual(["rb", ".."]);
  });

  it("scale with whole pixels, or mixed ones", () => {
    const editor = setup("rb");
    editor.commands.execute("image.scale", { width: 4, height: 1, smooth: false });
    expect(image(editor)).toEqual(["rrbb"]);
    editor.commands.execute("image.scale", { width: 1, height: 1, smooth: true });
    const pixel = editor.activeLayer!.tiles.readRegion({ x: 0, y: 0, width: 1, height: 1 });
    expect([...pixel]).toEqual([128, 0, 128, 255]);
  });

  it("keeps layers added later the canvas size", () => {
    const editor = setup("rb");
    editor.commands.execute("image.rotateRight");
    editor.commands.execute("layer.add");
    expect(editor.activeLayer!.tiles.width).toBe(1);
    expect(editor.activeLayer!.tiles.height).toBe(2);
  });
});
