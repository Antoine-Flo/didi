import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Drawing } from "./drawing";
import { addLayer, moveLayer, removeLayer, updateLayer, writePixels, type Edit } from "./edits";
import { capture, expectSameState, fill, pattern, randomEdit } from "./test-utils";

describe("edits", () => {
  it("add, update, move and remove layers, and undo them", () => {
    const d = new Drawing(64, 64);
    const a = d.createLayer({ name: "A" });
    const b = d.createLayer({ name: "B" });
    const edits: Edit[] = [
      addLayer(a),
      addLayer(b, 0),
      updateLayer(a.id, { opacity: 0.2 }),
      moveLayer(a.id, 0),
      removeLayer(b.id),
    ];
    for (const edit of edits) edit.apply(d);
    expect(d.layers.map((l) => [l.name, l.opacity])).toEqual([["A", 0.2]]);
    for (const edit of [...edits].reverse()) edit.revert(d);
    expect(d.layers).toEqual([]);
  });

  it("adds on top by default, and at the same position when redone", () => {
    const d = new Drawing(64, 64);
    const below = d.createLayer();
    const top = d.createLayer();
    const edit = addLayer(top);
    d.addLayer(below);
    edit.apply(d);
    edit.revert(d);
    expect(d.layers.map((l) => l.id)).toEqual([below.id]);
    edit.apply(d);
    expect(d.layers.map((l) => l.id)).toEqual([below.id, top.id]);
  });

  it("keeps only tiles in pixel edits, and redoes without the raw data", () => {
    const d = new Drawing(512, 512);
    const layer = d.createLayer();
    d.addLayer(layer);
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    const data = fill(rect, [50, 60, 70, 255]);
    const edit = writePixels(layer.id, rect, data);
    edit.apply(d);
    const painted = capture(d);
    data.fill(0); // the edit must not depend on the original buffer anymore
    edit.revert(d);
    expect(layer.tiles.tileCount).toBe(0);
    edit.apply(d);
    expectSameState(capture(d), painted);
  });

  it("can undo a paint edit on a layer that was locked afterwards", () => {
    const d = new Drawing(64, 64);
    const layer = d.createLayer();
    d.addLayer(layer);
    const rect = { x: 0, y: 0, width: 8, height: 8 };
    const paint = writePixels(layer.id, rect, pattern(rect, 1, 255));
    paint.apply(d);
    d.updateLayer(layer.id, { locked: true });
    paint.revert(d);
    expect(layer.tiles.tileCount).toBe(0);
  });

  it("undoing everything in reverse order restores the initial state, redoing restores the final one (property)", () => {
    fc.assert(
      fc.property(fc.array(randomEdit, { maxLength: 30 }), (ops) => {
        const d = new Drawing(300, 260);
        const initial = capture(d);
        const applied: Edit[] = [];
        for (const op of ops) {
          const edit = op(d);
          if (!edit) continue;
          edit.apply(d);
          applied.push(edit);
        }
        const final = capture(d);

        for (const edit of [...applied].reverse()) edit.revert(d);
        expectSameState(capture(d), initial);

        for (const edit of applied) edit.apply(d);
        expectSameState(capture(d), final);
      }),
      { numRuns: 150 },
    );
  });
});
