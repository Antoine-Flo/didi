import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

/**
 * A canvas from rows of letters, one layer: "r" red, "b" blue, "." transparent. Pixels are
 * read back the same way, so a test shows the image.
 */
function setup(...rows: string[]) {
  const width = rows[0].length;
  const height = rows.length;
  const editor = new Editor(new Drawing(width, height));
  commandsOf(editor).execute("layer.add");
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
    commandsOf(editor).execute("image.resizeCanvas", { width: 3, height: 1, dx: 1, dy: 0 });
    expect(image(editor)).toEqual([".rb"]);
    editor.history.undo();
    expect(image(editor)).toEqual(["rb", "br"]);
    editor.history.redo();
    expect(image(editor)).toEqual([".rb"]);
  });

  it("crop to the selection, and remove it", () => {
    const editor = setup("rbr", "bbb");
    editor.selection.set({ rect: { x: 1, y: 0, width: 2, height: 1 }, floating: null });
    commandsOf(editor).execute("image.cropToSelection");
    expect(image(editor)).toEqual(["br"]);
    expect(editor.selection.rect).toBeNull();
    editor.history.undo();
    expect(editor.selection.rect).toEqual({ x: 1, y: 0, width: 2, height: 1 });
  });

  it("trim to what is drawn", () => {
    const editor = setup("...", ".r.", "..b");
    commandsOf(editor).execute("image.trim");
    expect(image(editor)).toEqual(["r.", ".b"]);
  });

  it("rotate by quarter turns, and flip", () => {
    const editor = setup("rb", "..");
    commandsOf(editor).execute("image.rotateRight");
    expect(image(editor)).toEqual([".r", ".b"]);
    commandsOf(editor).execute("image.rotateLeft");
    expect(image(editor)).toEqual(["rb", ".."]);
    commandsOf(editor).execute("image.rotate180");
    expect(image(editor)).toEqual(["..", "br"]);
    commandsOf(editor).execute("image.flipHorizontal");
    expect(image(editor)).toEqual(["..", "rb"]);
    commandsOf(editor).execute("image.flipVertical");
    expect(image(editor)).toEqual(["rb", ".."]);
  });

  it("scales with whole pixels", () => {
    const editor = setup("rb");
    commandsOf(editor).execute("image.scale", { width: 4, height: 1 });
    expect(image(editor)).toEqual(["rrbb"]);
    commandsOf(editor).execute("image.scale", { width: 2, height: 1 });
    expect(image(editor)).toEqual(["rb"]);
  });

  it("keeps layers added later the canvas size", () => {
    const editor = setup("rb");
    commandsOf(editor).execute("image.rotateRight");
    commandsOf(editor).execute("layer.add");
    expect(editor.activeLayer!.tiles.width).toBe(1);
    expect(editor.activeLayer!.tiles.height).toBe(2);
  });
});
