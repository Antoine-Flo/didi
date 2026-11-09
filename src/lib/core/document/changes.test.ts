import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { Drawing, type DrawingChange } from "./drawing";
import { Editor } from "../editor/editor";
import { History } from "../history/history";
import type { LayerProps } from "./layer";
import { TILE_SIZE, tileCoord, tileKey } from "./tiles";
import { capture, expectSameState, fill, randomEdit, type DrawingState } from "../test-utils";

function record(d: Drawing) {
  const changes: DrawingChange[] = [];
  d.subscribe((c) => changes.push(c));
  return changes;
}

/**
 * Rebuilds the drawing from notifications only, the way a renderer would: it only copies
 * what each notification says has changed.
 */
class Mirror {
  private order: string[] = [];
  private props = new Map<string, LayerProps>();
  private pixels = new Map<string, Uint8ClampedArray>();

  constructor(private readonly d: Drawing) {
    d.subscribe((c) => this.apply(c));
  }

  private apply(c: DrawingChange) {
    const { d } = this;
    switch (c.type) {
      case "layer-added": {
        const layer = d.getLayer(c.id);
        this.order.splice(c.index, 0, c.id);
        const { name, visible, opacity, blendMode, locked, alphaLocked } = layer;
        this.props.set(c.id, { name, visible, opacity, blendMode, locked, alphaLocked });
        this.pixels.set(
          c.id,
          layer.tiles.readRegion({ x: 0, y: 0, width: d.width, height: d.height }),
        );
        break;
      }
      case "layer-removed":
        expect(this.order[c.index]).toBe(c.id);
        this.order.splice(c.index, 1);
        break;
      case "layer-moved":
        expect(this.order[c.from]).toBe(c.id);
        this.order.splice(c.from, 1);
        this.order.splice(c.to, 0, c.id);
        break;
      case "layer-updated": {
        const props = this.props.get(c.id)!;
        const layer = d.getLayer(c.id);
        for (const key of c.keys) {
          Object.assign(props, { [key]: layer[key] });
        }
        break;
      }
      case "pixels-changed": {
        const buffer = this.pixels.get(c.id)!;
        const tiles = d.getLayer(c.id).tiles;
        for (const key of c.tiles) {
          const { tx, ty } = tileCoord(key);
          const x = tx * TILE_SIZE;
          const y = ty * TILE_SIZE;
          const width = Math.min(TILE_SIZE, d.width - x);
          const height = Math.min(TILE_SIZE, d.height - y);
          const data = tiles.readRegion({ x, y, width, height });
          for (let row = 0; row < height; row++) {
            buffer.set(
              data.subarray(row * width * 4, (row + 1) * width * 4),
              ((y + row) * d.width + x) * 4,
            );
          }
        }
        break;
      }
    }
  }

  state(): DrawingState {
    return this.order.map((id) => {
      const { name, visible, opacity, blendMode, locked } = this.props.get(id)!;
      return {
        props: JSON.stringify({ id, name, visible, opacity, blendMode, locked }),
        pixels: this.pixels.get(id)!,
      };
    });
  }
}

describe("drawing change notifications", () => {
  it("notifies layer additions, removals and moves", () => {
    const d = new Drawing(64, 64);
    const changes = record(d);
    const [a, b] = [d.createLayer(), d.createLayer()];
    d.addLayer(a);
    d.addLayer(b);
    d.moveLayer(b.id, 0);
    d.removeLayer(a.id);
    expect(changes).toEqual([
      { type: "layer-added", id: a.id, index: 0 },
      { type: "layer-added", id: b.id, index: 1 },
      { type: "layer-moved", id: b.id, from: 1, to: 0 },
      { type: "layer-removed", id: a.id, index: 1 },
    ]);
  });

  it("does not notify moves to the same place or empty updates", () => {
    const d = new Drawing(64, 64);
    const a = d.createLayer();
    d.addLayer(a);
    const changes = record(d);
    d.moveLayer(a.id, 0);
    d.updateLayer(a.id, {});
    expect(changes).toEqual([]);
  });

  it("notifies only the changed settings", () => {
    const d = new Drawing(64, 64);
    const a = d.createLayer();
    d.addLayer(a);
    const changes = record(d);
    d.updateLayer(a.id, { opacity: 0.5, visible: false });
    expect(changes).toEqual([{ type: "layer-updated", id: a.id, keys: ["visible", "opacity"] }]);
  });

  it("notifies exactly the tiles touched by a write and by a restore", () => {
    const d = new Drawing(1024, 1024);
    const a = d.createLayer();
    d.addLayer(a);
    const changes = record(d);
    const rect = { x: 250, y: 250, width: 10, height: 10 };
    const before = d.writePixels(a.id, rect, fill(rect, [1, 1, 1, 255]));
    d.restorePixels(a.id, before);
    const expected = [tileKey(0, 0), tileKey(1, 0), tileKey(0, 1), tileKey(1, 1)];
    expect(changes).toEqual([
      { type: "pixels-changed", id: a.id, tiles: expected },
      { type: "pixels-changed", id: a.id, tiles: expected },
    ]);
  });

  it("does not notify writes entirely outside the canvas", () => {
    const d = new Drawing(64, 64);
    const a = d.createLayer();
    d.addLayer(a);
    const changes = record(d);
    const rect = { x: 100, y: 100, width: 4, height: 4 };
    d.writePixels(a.id, rect, fill(rect, [1, 1, 1, 255]));
    expect(changes).toEqual([]);
  });

  it("lets a mirror built from notifications stay identical through edits, undo and redo (property)", () => {
    const action = fc.oneof(
      { weight: 3, arbitrary: randomEdit.map((make) => ({ kind: "push" as const, make })) },
      { weight: 1, arbitrary: fc.constant({ kind: "undo" as const }) },
      { weight: 1, arbitrary: fc.constant({ kind: "redo" as const }) },
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const d = new Drawing(300, 260);
        const history = new History(d);
        const mirror = new Mirror(d);
        for (const a of actions) {
          if (a.kind === "push") {
            const edit = a.make(d);
            if (edit) {
              history.push(edit);
            }
          } else if (a.kind === "undo") {
            history.undo();
          } else {
            history.redo();
          }
          expectSameState(mirror.state(), capture(d));
        }
      }),
      { numRuns: 150 },
    );
  });
});

describe("active layer notifications", () => {
  it("notifies each change of active layer, including after undo", () => {
    const editor = new Editor(new Drawing(64, 64));
    const listener = vi.fn();
    editor.onActiveLayerChange(listener);
    editor.commands.execute("layer.add");
    const first = editor.activeLayer!.id;
    editor.commands.execute("layer.add");
    const second = editor.activeLayer!.id;
    editor.setActiveLayer(second); // unchanged: no notification
    editor.commands.execute("history.undo");
    editor.commands.execute("history.undo");
    expect(listener.mock.calls).toEqual([[first], [second], [first], [null]]);
  });
});
