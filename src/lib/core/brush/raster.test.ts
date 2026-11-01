import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Drawing } from "../drawing";
import { History } from "../history";
import { capture, expectSameState, fill, pattern } from "../test-utils";
import { PixelPathBuilder, type Pixel } from "./pixel-path";
import { StrokeRaster, pixelStamp, type StrokeStyle } from "./raster";

const RED: StrokeStyle = { color: [255, 0, 0], opacity: 1, mode: "paint" };

function setup(width = 300, height = 300) {
  const drawing = new Drawing(width, height);
  const layer = drawing.createLayer();
  drawing.addLayer(layer);
  return { drawing, id: layer.id, history: new History(drawing) };
}

function pixelAt(d: Drawing, id: string, x: number, y: number): number[] {
  return [...d.getLayer(id).tiles.readRegion({ x, y, width: 1, height: 1 })];
}

const row = (y: number, x0: number, x1: number): Pixel[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));

describe("StrokeRaster", () => {
  it("builds round pixel brushes", () => {
    expect(pixelStamp(1)).toEqual([{ x: 0, y: 0 }]);
    expect(pixelStamp(2)).toHaveLength(4);
    expect(pixelStamp(3)).toHaveLength(9);
    // A 5-pixel brush has its corners cut.
    const five = pixelStamp(5);
    expect(five.some((p) => p.x === -2 && p.y === -2)).toBe(false);
    expect(five.some((p) => p.x === 0 && p.y === -2)).toBe(true);
  });

  it("paints exact colors, without anti-aliasing", () => {
    const { drawing, id } = setup();
    const stroke = new StrokeRaster(drawing, id, {
      color: [12, 34, 56],
      opacity: 1,
      mode: "paint",
    });
    stroke.setPixels([{ x: 10, y: 10 }], 1, true);
    stroke.flush();
    expect(pixelAt(drawing, id, 10, 10)).toEqual([12, 34, 56, 255]);
    expect(pixelAt(drawing, id, 11, 10)).toEqual([0, 0, 0, 0]);
  });

  it("caps the stroke at its opacity, however many times a pixel is covered", () => {
    const { drawing, id } = setup();
    const stroke = new StrokeRaster(drawing, id, { ...RED, opacity: 0.5 });
    for (let i = 0; i < 10; i++) stroke.setPixels([{ x: 5, y: 5 }], 3, true);
    stroke.flush();
    expect(pixelAt(drawing, id, 5, 5)).toEqual([128, 0, 0, 128]);
  });

  it("paints over existing pixels with source-over", () => {
    const { drawing, id } = setup();
    const all = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(id, all, fill(all, [0, 0, 255, 255]));
    const stroke = new StrokeRaster(drawing, id, { ...RED, opacity: 0.5 });
    stroke.setPixels([{ x: 100, y: 100 }], 1, true);
    stroke.flush();
    expect(pixelAt(drawing, id, 100, 100)).toEqual([128, 0, 128, 255]);
  });

  it("erases", () => {
    const { drawing, id } = setup();
    const all = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(id, all, fill(all, [0, 200, 0, 255]));
    const half = new StrokeRaster(drawing, id, { ...RED, opacity: 0.5, mode: "erase" });
    half.setPixels([{ x: 50, y: 50 }], 1, true);
    half.finish("Eraser");
    expect(pixelAt(drawing, id, 50, 50)).toEqual([0, 100, 0, 128]);
    const full = new StrokeRaster(drawing, id, { ...RED, mode: "erase" });
    full.setPixels([{ x: 150, y: 150 }], 1, true);
    full.finish("Eraser");
    expect(pixelAt(drawing, id, 150, 150)).toEqual([0, 0, 0, 0]);
  });

  it("ignores pixels outside the canvas", () => {
    const { drawing, id } = setup(100, 100);
    const stroke = new StrokeRaster(drawing, id, RED);
    stroke.setPixels(
      [
        { x: -5, y: 3 },
        { x: 100, y: 50 },
      ],
      1,
      true,
    );
    expect(stroke.finish("Pixel brush")).toBeNull();
  });

  it("refuses locked layers", () => {
    const { drawing, id } = setup();
    drawing.updateLayer(id, { locked: true });
    expect(() => new StrokeRaster(drawing, id, RED)).toThrow();
  });

  it("restores the pixel under a removed pixel-perfect corner", () => {
    const { drawing, id } = setup();
    const all = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(id, all, pattern(all, 5, 255));
    const original = pixelAt(drawing, id, 1, 0);
    const stroke = new StrokeRaster(drawing, id, RED);
    const path = new PixelPathBuilder(true);
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [1, 1],
    ]) {
      const { paint, unpaint } = path.add(x, y);
      stroke.setPixels(paint, 1, true);
      stroke.setPixels(unpaint, 1, false);
    }
    stroke.flush();
    expect(pixelAt(drawing, id, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(drawing, id, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(drawing, id, 1, 0)).toEqual(original);
  });
});

describe("StrokeRaster: history", () => {
  it("makes the whole stroke one undo step", () => {
    const { drawing, id, history } = setup(600, 600);
    const before = capture(drawing);
    const stroke = new StrokeRaster(drawing, id, RED);
    for (let y = 10; y < 590; y += 20) {
      stroke.setPixels(row(y, 10, 590), 2, true);
      stroke.flush();
    }
    // The last pixels are not flushed yet: finishing must include them.
    stroke.setPixels([{ x: 300, y: 595 }], 1, true);
    history.push(stroke.finish("Pixel brush")!);
    expect(pixelAt(drawing, id, 300, 595)).toEqual([255, 0, 0, 255]);
    const after = capture(drawing);
    expect(history.steps).toBe(1);
    history.undo();
    expectSameState(capture(drawing), before);
    history.redo();
    expectSameState(capture(drawing), after);
  });

  it("restores the layer when cancelled", () => {
    const { drawing, id } = setup();
    const all = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(id, all, pattern(all, 3, 255));
    const before = capture(drawing);
    const stroke = new StrokeRaster(drawing, id, RED);
    stroke.setPixels(row(100, 0, 299), 5, true);
    stroke.flush();
    stroke.cancel();
    expectSameState(capture(drawing), before);
    expect(() => stroke.setPixels([{ x: 1, y: 1 }], 1, true)).toThrow();
  });

  it("only changes the covered pixels, and keeps valid pixels (property)", () => {
    const pixels = fc.array(
      fc.record({ x: fc.integer({ min: -10, max: 270 }), y: fc.integer({ min: -10, max: 270 }) }),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(
        pixels,
        fc.integer({ min: 1, max: 6 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom("paint" as const, "erase" as const),
        (list, size, opacity, mode) => {
          const { drawing, id } = setup(260, 260);
          const all = { x: 0, y: 0, width: 260, height: 260 };
          drawing.writePixels(id, all, pattern(all, 9, 200));
          const before = drawing.getLayer(id).tiles.readRegion(all);
          const stroke = new StrokeRaster(drawing, id, { color: [10, 200, 90], opacity, mode });
          stroke.setPixels(list, size, true);
          stroke.flush();
          const after = drawing.getLayer(id).tiles.readRegion(all);
          const covered = new Set(
            list.flatMap((p) => pixelStamp(size).map((o) => `${p.x + o.x},${p.y + o.y}`)),
          );
          let bad = "";
          for (let y = 0; y < 260 && !bad; y++) {
            for (let x = 0; x < 260; x++) {
              const i = (y * 260 + x) * 4;
              const a = after[i + 3];
              if (after[i] > a || after[i + 1] > a || after[i + 2] > a) bad = `invalid ${x},${y}`;
              const same = [0, 1, 2, 3].every((c) => after[i + c] === before[i + c]);
              if (!covered.has(`${x},${y}`) && !same) bad = `pixel ${x},${y} changed`;
              if (bad) break;
            }
          }
          expect(bad).toBe("");
        },
      ),
      { numRuns: 60 },
    );
  });
});
