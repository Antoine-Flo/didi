import fc from "fast-check";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_GRID,
  DidiFileError,
  documentFromEditor,
  editorFromDocument,
  flattenDocument,
  readDidi,
  readDidiThumbnail,
  writeDidi,
} from "./didi-file";
import { Drawing } from "../document/drawing";
import { Editor } from "../editor/editor";
import { BLEND_MODES } from "../document/layer";
import { decodePng } from "./png";
import { firstDifference, pattern } from "../test-utils";

/** Layer settings and pixels, without ids (they are not saved). */
function state(editor: Editor) {
  const { drawing } = editor;
  const all = { x: 0, y: 0, width: drawing.width, height: drawing.height };
  return {
    size: [drawing.width, drawing.height],
    active: editor.activeLayer ? drawing.indexOf(editor.activeLayer.id) : -1,
    layers: drawing.layers.map((l) => ({
      props: {
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        alphaLocked: l.alphaLocked,
        opacity: l.opacity,
        blendMode: l.blendMode,
      },
      pixels: l.tiles.readRegion(all),
    })),
  };
}

function expectSame(a: Editor, b: Editor) {
  const sa = state(a);
  const sb = state(b);
  expect(sb.size).toEqual(sa.size);
  expect(sb.active).toBe(sa.active);
  expect(sb.layers.map((l) => l.props)).toEqual(sa.layers.map((l) => l.props));
  sa.layers.forEach((l, i) => expect(firstDifference(l.pixels, sb.layers[i].pixels)).toBe(-1));
}

function sample(width = 300, height = 200): Editor {
  const drawing = new Drawing(width, height);
  const names = ["Background", "Sketch", "Ink"];
  names.forEach((name, i) => {
    const layer = drawing.createLayer({ name, opacity: 1 - i * 0.25 });
    drawing.addLayer(layer);
    const rect = {
      x: i * 20,
      y: i * 10,
      width: Math.min(120, width),
      height: Math.min(80, height),
    };
    drawing.writePixels(layer.id, rect, pattern(rect, i + 1, [255, 128, 7][i]));
  });
  drawing.updateLayer(drawing.layers[1].id, { visible: false, blendMode: "screen" });
  drawing.updateLayer(drawing.layers[2].id, { locked: true });
  drawing.updateLayer(drawing.layers[0].id, { alphaLocked: true });
  const editor = new Editor(drawing);
  editor.setActiveLayer(drawing.layers[1].id);
  return editor;
}

const reload = (editor: Editor, extensions = {}) =>
  readDidi(writeDidi(documentFromEditor(editor, extensions)));

describe(".didi files", () => {
  it("saves and reloads layers, settings, pixels and the active layer", () => {
    const editor = sample();
    const back = editorFromDocument(reload(editor));
    expectSame(editor, back);
    expect(back.drawing.layers[2].locked).toBe(true);
    expect(back.drawing.layers[0].alphaLocked).toBe(true);
    expect(back.history.steps).toBe(0);
  });

  it("saves the mode, and reads files without one", () => {
    const editor = sample();
    expect(readDidi(writeDidi(documentFromEditor(editor, {}, "pixel"))).mode).toBe("pixel");
    expect(reload(editor).mode).toBeNull();
    const json = JSON.parse(
      strFromU8(unzipSync(writeDidi(documentFromEditor(editor)))["document.json"]),
    );
    expect(json).not.toHaveProperty("mode");
  });

  it("saves the tiles' grid, and gives older files the default one", () => {
    const editor = sample();
    for (const grid of [
      { width: 32, height: 8, shown: true },
      { width: 4, height: 4, shown: false },
    ]) {
      expect(readDidi(writeDidi(documentFromEditor(editor, {}, null, grid))).grid).toEqual(grid);
    }
    // A file from before grids, or with a grid not understood.
    const files = unzipSync(writeDidi(documentFromEditor(editor)));
    for (const value of [undefined, { width: 0, height: 16 }, "16"]) {
      const json = JSON.parse(strFromU8(files["document.json"]));
      if (value === undefined) delete json.grid;
      else json.grid = value;
      const bytes = zipSync({ ...files, "document.json": strToU8(JSON.stringify(json)) });
      expect(readDidi(bytes).grid).toEqual(DEFAULT_TILE_GRID);
    }
  });

  it("round-trips any document", () => {
    const layer = fc.record({
      name: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim() !== ""),
      visible: fc.boolean(),
      locked: fc.boolean(),
      alphaLocked: fc.boolean(),
      opacity: fc.double({ min: 0, max: 1, noNaN: true }),
      blendMode: fc.constantFrom(...BLEND_MODES),
      alpha: fc.integer({ min: 0, max: 255 }),
      seed: fc.integer({ min: 0, max: 1000 }),
      x: fc.integer({ min: -10, max: 300 }),
      y: fc.integer({ min: -10, max: 300 }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 1, max: 270 }),
        fc.array(layer, { maxLength: 3 }),
        (width, height, layers) => {
          const drawing = new Drawing(width, height);
          for (const l of layers) {
            const created = drawing.createLayer({
              name: l.name,
              visible: l.visible,
              opacity: l.opacity,
              blendMode: l.blendMode,
              alphaLocked: l.alphaLocked,
            });
            drawing.addLayer(created);
            const rect = { x: l.x, y: l.y, width: 40, height: 30 };
            drawing.writePixels(created.id, rect, pattern(rect, l.seed, l.alpha));
            if (l.locked) drawing.updateLayer(created.id, { locked: true });
          }
          const editor = new Editor(drawing);
          expectSame(editor, editorFromDocument(reload(editor)));
        },
      ),
      { numRuns: 40 },
    );
  });

  it("writes a readable zip: mimetype first, JSON, one PNG per layer, a thumbnail", () => {
    const bytes = writeDidi(documentFromEditor(sample()));
    const files = unzipSync(bytes);
    expect(Object.keys(files)[0]).toBe("mimetype");
    expect(strFromU8(files.mimetype)).toBe("application/x-didi");
    const json = JSON.parse(strFromU8(files["document.json"]));
    expect(json).toMatchObject({
      format: "didi",
      version: 1,
      width: 300,
      height: 200,
      activeLayer: 1,
    });
    expect(json.layers.map((l: { file: string }) => l.file)).toEqual([
      "layers/1.png",
      "layers/2.png",
      "layers/3.png",
    ]);
    expect(decodePng(files["layers/2.png"]).width).toBe(300);
    const thumb = decodePng(readDidiThumbnail(bytes)!);
    expect([thumb.width, thumb.height]).toEqual([256, 171]);
  });

  it("keeps the extensions of other modules", () => {
    const extensions = { godot: { texture: "res://hero.png", frames: [1, 2] } };
    expect(reload(sample(), extensions).extensions).toEqual(extensions);
  });

  it("flattens visible layers for export", () => {
    const drawing = new Drawing(2, 1);
    const a = drawing.createLayer();
    drawing.addLayer(a);
    drawing.writePixels(
      a.id,
      { x: 0, y: 0, width: 2, height: 1 },
      new Uint8ClampedArray([128, 0, 0, 128, 0, 0, 0, 0]),
    );
    const hidden = drawing.createLayer({ visible: false });
    drawing.addLayer(hidden);
    drawing.writePixels(
      hidden.id,
      { x: 0, y: 0, width: 2, height: 1 },
      new Uint8ClampedArray(8).fill(255),
    );
    // Straight alpha: half-transparent pure red.
    expect([...flattenDocument(documentFromEditor(new Editor(drawing)))]).toEqual([
      255, 0, 0, 128, 0, 0, 0, 0,
    ]);
  });

  describe("errors", () => {
    const valid = () => unzipSync(writeDidi(documentFromEditor(sample(40, 30))));
    const withJson = (change: (json: Record<string, unknown>) => void) => {
      const files = valid();
      const json = JSON.parse(strFromU8(files["document.json"]));
      change(json);
      files["document.json"] = strToU8(JSON.stringify(json));
      return zipSync(files);
    };
    const message = (bytes: Uint8Array) => {
      try {
        readDidi(bytes);
        return "read";
      } catch (e) {
        expect(e).toBeInstanceOf(DidiFileError);
        return (e as Error).message;
      }
    };

    it("explains why a file cannot be read", () => {
      expect(message(new Uint8Array([1, 2, 3]))).toMatch(/not a Didi file/);
      expect(message(zipSync({ "a.txt": strToU8("hi") }))).toMatch(/document.json is missing/);
      expect(message(zipSync({ "document.json": strToU8("{") }))).toMatch(/not valid JSON/);
      expect(message(withJson((j) => (j.format = "other")))).toMatch(/not a Didi file/);
      expect(message(withJson((j) => (j.version = 2)))).toMatch(/newer version/);
      expect(message(withJson((j) => (j.version = 0)))).toMatch(/invalid version/);
      expect(message(withJson((j) => (j.width = -3)))).toMatch(/invalid size/);
      expect(
        message(withJson((j) => ((j.layers as { opacity: number }[])[0].opacity = 3))),
      ).toMatch(/layer 1: invalid opacity/);
      expect(
        message(withJson((j) => ((j.layers as { blendMode: string }[])[1].blendMode = "x"))),
      ).toMatch(/unknown blend mode/);
      expect(
        message(withJson((j) => ((j.layers as { file: string }[])[0].file = "nope.png"))),
      ).toMatch(/nope.png is missing/);
      expect(message(withJson((j) => (j.width = 41)))).toMatch(
        /is 40 × 30, the document is 41 × 30/,
      );
    });

    it("fills in missing layer settings", () => {
      const doc = readDidi(
        withJson((j) => ((j.layers as Record<string, unknown>[])[0] = { file: "layers/1.png" })),
      );
      expect(doc.layers[0].props).toEqual({
        name: "Layer",
        visible: true,
        locked: false,
        alphaLocked: false,
        opacity: 1,
        blendMode: "normal",
      });
    });

    it("never fails with anything but a readable error on damaged files", () => {
      const bytes = writeDidi(documentFromEditor(sample(40, 30)));
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: bytes.length - 1 }),
          fc.integer({ min: 1, max: 255 }),
          fc.boolean(),
          (at, flip, truncate) => {
            const damaged = truncate ? bytes.slice(0, at) : bytes.slice();
            if (!truncate) damaged[at] ^= flip;
            message(damaged);
          },
        ),
        { numRuns: 300 },
      );
    });
  });
});
