import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { Drawing } from "./drawing";
import { addLayer, updateLayer, writePixels } from "./edits";
import { History } from "./history";
import { TILE_SIZE } from "./tiles";
import { capture, expectSameState, fill, randomEdit, type DrawingState } from "./test-utils";

function setup(options = {}) {
  const drawing = new Drawing(512, 512);
  const history = new History(drawing, options);
  const layer = drawing.createLayer();
  history.push(addLayer(layer));
  history.clear();
  return { drawing, history, id: layer.id };
}

const opacityOf = (d: Drawing, id: string) => d.getLayer(id).opacity;

describe("History", () => {
  it("applies pushed edits, undoes and redoes them", () => {
    const { drawing, history, id } = setup();
    history.push(updateLayer(id, { opacity: 0.5 }));
    expect(opacityOf(drawing, id)).toBe(0.5);
    expect(history.undoLabel).toBe("Modifier le calque");

    expect(history.undo()).toBe(true);
    expect(opacityOf(drawing, id)).toBe(1);
    expect(history.canUndo).toBe(false);
    expect(history.redoLabel).toBe("Modifier le calque");

    expect(history.redo()).toBe(true);
    expect(opacityOf(drawing, id)).toBe(0.5);
  });

  it("returns false when there is nothing to undo or redo", () => {
    const { history } = setup();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("drops the redo steps when a new edit is pushed", () => {
    const { history, id } = setup();
    history.push(updateLayer(id, { opacity: 0.5 }));
    history.undo();
    history.push(updateLayer(id, { name: "Autre" }));
    expect(history.canRedo).toBe(false);
  });

  it("groups edits into one step", () => {
    const { drawing, history, id } = setup();
    history.begin("Opacité");
    for (const opacity of [0.9, 0.7, 0.4]) history.push(updateLayer(id, { opacity }));
    expect(opacityOf(drawing, id)).toBe(0.4);
    history.end();
    expect(history.steps).toBe(1);
    expect(history.undoLabel).toBe("Opacité");
    history.undo();
    expect(opacityOf(drawing, id)).toBe(1);
    history.redo();
    expect(opacityOf(drawing, id)).toBe(0.4);
  });

  it("leaves no step for an empty group", () => {
    const { history } = setup();
    history.begin("Rien");
    history.end();
    expect(history.steps).toBe(0);
  });

  it("merges nested groups into the outermost one", () => {
    const { history, id } = setup();
    history.begin("Externe");
    history.push(updateLayer(id, { opacity: 0.5 }));
    history.begin("Interne");
    history.push(updateLayer(id, { name: "X" }));
    history.end();
    history.end();
    expect(history.steps).toBe(1);
    expect(history.undoLabel).toBe("Externe");
  });

  it("closes an open group before undoing it", () => {
    const { drawing, history, id } = setup();
    history.begin("Glisser");
    history.push(updateLayer(id, { opacity: 0.5 }));
    history.push(updateLayer(id, { opacity: 0.2 }));
    history.undo();
    expect(opacityOf(drawing, id)).toBe(1);
    expect(() => history.end()).toThrow();
  });

  it("does not record an edit that fails to apply", () => {
    const { history } = setup();
    expect(() => history.push(updateLayer("nope", { opacity: 0.5 }))).toThrow();
    expect(history.steps).toBe(0);
  });

  it("keeps at most maxSteps steps", () => {
    const { drawing, history, id } = setup({ maxSteps: 3 });
    for (const opacity of [0.9, 0.8, 0.7, 0.6, 0.5]) history.push(updateLayer(id, { opacity }));
    expect(history.steps).toBe(3);
    while (history.undo());
    expect(opacityOf(drawing, id)).toBe(0.8);
  });

  it("drops the oldest steps over the memory budget, but keeps the last one", () => {
    const tileBytes = TILE_SIZE * TILE_SIZE * 4;
    const { history, id } = setup({ maxBytes: tileBytes * 2.5 });
    const paintTile = (tx: number) => {
      const rect = { x: tx * TILE_SIZE, y: 0, width: TILE_SIZE, height: TILE_SIZE };
      history.push(writePixels(id, rect, fill(rect, [1, 2, 3, 255])));
    };
    // Each edit paints a new tile: nothing before, one tile after.
    paintTile(0);
    paintTile(1);
    expect(history.steps).toBe(2);
    paintTile(0);
    // The third edit keeps two tiles (before and after): the two older steps must go.
    expect(history.steps).toBe(1);
    expect(history.bytes).toBeLessThanOrEqual(tileBytes * 2.5);

    const tiny = setup({ maxBytes: 1 });
    const rect = { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE };
    tiny.history.push(writePixels(tiny.id, rect, fill(rect, [1, 2, 3, 255])));
    expect(tiny.history.steps).toBe(1);
  });

  it("notifies listeners after every change", () => {
    const { history, id } = setup();
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);
    history.push(updateLayer(id, { opacity: 0.5 }));
    history.undo();
    history.redo();
    history.begin("G");
    history.end();
    history.clear();
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
    history.push(updateLayer(id, { opacity: 0.2 }));
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it("behaves like a stack of states for any sequence of actions (property)", () => {
    const action = fc.oneof(
      { weight: 4, arbitrary: randomEdit.map((make) => ({ kind: "push" as const, make })) },
      { weight: 2, arbitrary: fc.constant({ kind: "undo" as const }) },
      { weight: 2, arbitrary: fc.constant({ kind: "redo" as const }) },
      { weight: 2, arbitrary: fc.constant({ kind: "begin" as const }) },
      { weight: 1, arbitrary: fc.constant({ kind: "end" as const }) },
    );

    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        const drawing = new Drawing(300, 260);
        const history = new History(drawing);

        // Model: states before each step, the present state, states after each undone step.
        const past: DrawingState[] = [];
        let present = capture(drawing);
        let future: DrawingState[] = [];
        let depth = 0;
        let groupStart: DrawingState | null = null;
        let groupHasEdits = false;

        const endGroup = () => {
          depth = 0;
          if (groupHasEdits) {
            past.push(groupStart!);
            future = [];
          }
          groupStart = null;
          groupHasEdits = false;
        };

        for (const a of actions) {
          if (a.kind === "push") {
            const edit = a.make(drawing);
            if (!edit) continue;
            history.push(edit);
            if (depth > 0) {
              groupHasEdits = true;
            } else {
              past.push(present);
              future = [];
            }
            present = capture(drawing);
          } else if (a.kind === "begin") {
            history.begin("Groupe");
            if (depth++ === 0) groupStart = present;
          } else if (a.kind === "end") {
            if (depth === 0) {
              expect(() => history.end()).toThrow();
              continue;
            }
            history.end();
            if (--depth === 0) endGroup();
          } else if (a.kind === "undo") {
            history.undo();
            if (depth > 0) endGroup();
            if (past.length) {
              future.push(present);
              present = past.pop()!;
            }
          } else {
            history.redo();
            if (depth > 0) endGroup();
            if (future.length) {
              past.push(present);
              present = future.pop()!;
            }
          }

          expectSameState(capture(drawing), present);
          expect(history.canUndo).toBe(past.length > 0 || groupHasEdits);
          expect(history.canRedo).toBe(future.length > 0);
        }
      }),
      { numRuns: 150 },
    );
  });
});
