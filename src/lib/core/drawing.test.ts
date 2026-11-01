import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Drawing } from "./drawing";
import { BLEND_MODES, type LayerProps } from "./layer";
import { TileStore } from "./tiles";
import { capture, expectSameState, fill, pattern } from "./test-utils";

const W = 300;
const H = 260;

describe("Drawing", () => {
  it("rejects invalid sizes", () => {
    expect(() => new Drawing(0, 100)).toThrow(RangeError);
  });

  it("creates layers with unique ids and default settings", () => {
    const d = new Drawing(W, H);
    const a = d.createLayer();
    const b = d.createLayer({ name: "Encre", opacity: 0.5 });
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ name: "Layer", visible: true, opacity: 1, blendMode: "normal" });
    expect(b).toMatchObject({ name: "Encre", opacity: 0.5 });
    expect(d.layers).toHaveLength(0);
  });

  it("does not reuse ids of layers loaded from elsewhere", () => {
    const d = new Drawing(W, H);
    d.addLayer({ ...d.createLayer(), id: "layer-2" });
    expect(d.createLayer().id).not.toBe("layer-2");
  });

  it("adds layers on top by default, or at a given index", () => {
    const d = new Drawing(W, H);
    const [a, b, c] = [d.createLayer(), d.createLayer(), d.createLayer()];
    d.addLayer(a);
    d.addLayer(b);
    d.addLayer(c, 0);
    expect(d.layers.map((l) => l.id)).toEqual([c.id, a.id, b.id]);
  });

  it("refuses duplicate ids, wrong sizes and invalid indices", () => {
    const d = new Drawing(W, H);
    const a = d.createLayer();
    d.addLayer(a);
    expect(() => d.addLayer(a)).toThrow();
    expect(() => d.addLayer({ ...d.createLayer(), tiles: new TileStore(10, 10) })).toThrow(
      RangeError,
    );
    expect(() => d.addLayer(d.createLayer(), 5)).toThrow(RangeError);
    expect(() => d.moveLayer(a.id, 1)).toThrow(RangeError);
    expect(() => d.removeLayer("nope")).toThrow();
  });

  it("validates layer settings", () => {
    const d = new Drawing(W, H);
    const a = d.createLayer();
    d.addLayer(a);
    expect(() => d.createLayer({ name: "  " })).toThrow(RangeError);
    expect(() => d.updateLayer(a.id, { opacity: 2 })).toThrow(RangeError);
    expect(() => d.updateLayer(a.id, { opacity: NaN })).toThrow(RangeError);
    expect(() => d.updateLayer(a.id, { blendMode: "glow" as never })).toThrow(RangeError);
  });

  it("returns only the previous values of changed settings", () => {
    const d = new Drawing(W, H);
    const a = d.createLayer();
    d.addLayer(a);
    expect(d.updateLayer(a.id, { name: "Background", opacity: 0.3 })).toEqual({
      name: "Layer",
      opacity: 1,
    });
  });

  it("never changes the id or tiles through updateLayer", () => {
    const d = new Drawing(W, H);
    const a = d.createLayer();
    d.addLayer(a);
    d.updateLayer(a.id, { id: "hacked", tiles: null } as unknown as Partial<LayerProps>);
    expect(d.getLayer(a.id).tiles).toBeInstanceOf(TileStore);
  });

  it("refuses to paint on a locked layer, but history can still restore it", () => {
    const d = new Drawing(W, H);
    const a = d.createLayer();
    d.addLayer(a);
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    const before = d.writePixels(a.id, rect, fill(rect, [255, 0, 0, 255]));
    d.updateLayer(a.id, { locked: true });
    expect(() => d.writePixels(a.id, rect, fill(rect, [0, 255, 0, 255]))).toThrow();
    d.restorePixels(a.id, before);
    expect(d.getLayer(a.id).tiles.tileCount).toBe(0);
  });

  it("can undo and redo any operation in any sequence (property)", () => {
    const pick = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
    const props = fc.record(
      {
        name: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""),
        visible: fc.boolean(),
        opacity: fc.double({ min: 0, max: 1, noNaN: true }),
        blendMode: fc.constantFrom(...BLEND_MODES),
        locked: fc.boolean(),
      },
      { requiredKeys: [] },
    );
    const op = fc.oneof(
      fc.record({ kind: fc.constant("add" as const), props, at: pick }),
      fc.record({ kind: fc.constant("remove" as const), which: pick }),
      fc.record({ kind: fc.constant("move" as const), which: pick, to: pick }),
      fc.record({ kind: fc.constant("update" as const), which: pick, props }),
      fc.record({
        kind: fc.constant("paint" as const),
        which: pick,
        x: fc.integer({ min: -50, max: W }),
        y: fc.integer({ min: -50, max: H }),
        width: fc.integer({ min: 1, max: 200 }),
        height: fc.integer({ min: 1, max: 200 }),
        seed: fc.integer({ min: 0, max: 255 }),
        alpha: fc.constantFrom(0, 128, 255),
      }),
    );

    fc.assert(
      fc.property(fc.array(op, { maxLength: 25 }), (ops) => {
        const d = new Drawing(W, H);
        const at = (p: number, size: number) => Math.floor(p * size);

        for (const o of ops) {
          const before = capture(d);
          let undo: () => void;
          let redo: () => void;

          if (o.kind === "add") {
            const layer = d.createLayer(o.props);
            const index = at(o.at, d.layers.length + 1);
            redo = () => d.addLayer(layer, index);
            undo = () => d.removeLayer(layer.id);
          } else {
            if (d.layers.length === 0) continue;
            const id = d.layers[at(o.which, d.layers.length)].id;
            if (o.kind === "remove") {
              let removed = d.removeLayer(id);
              d.addLayer(removed.layer, removed.index);
              redo = () => (removed = d.removeLayer(id));
              undo = () => d.addLayer(removed.layer, removed.index);
            } else if (o.kind === "move") {
              const to = at(o.to, d.layers.length);
              let from = 0;
              redo = () => (from = d.moveLayer(id, to));
              undo = () => d.moveLayer(id, from);
            } else if (o.kind === "update") {
              let previous: Partial<LayerProps> = {};
              redo = () => (previous = d.updateLayer(id, o.props));
              undo = () => d.updateLayer(id, previous);
            } else {
              const data = pattern(o, o.seed, o.alpha);
              if (d.getLayer(id).locked) {
                expect(() => d.writePixels(id, o, data)).toThrow();
                expectSameState(capture(d), before);
                continue;
              }
              let saved = d.writePixels(id, o, data);
              d.restorePixels(id, saved);
              redo = () => (saved = d.writePixels(id, o, data));
              undo = () => d.restorePixels(id, saved);
            }
          }

          redo();
          const after = capture(d);
          undo();
          expectSameState(capture(d), before);
          redo();
          expectSameState(capture(d), after);
        }
      }),
      { numRuns: 150 },
    );
  });
});
