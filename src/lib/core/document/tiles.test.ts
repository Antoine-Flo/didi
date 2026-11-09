import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Rect } from "#lib/core/geometry.js";
import {
  TILE_SIZE,
  TileStore,
  isTransparent,
  tileCoord,
  tileKey,
} from "#lib/core/document/tiles.js";
import { fill, firstDifference, pattern } from "#lib/core/test-utils.js";

/** Naive reference: a flat pixel array the size of the canvas. */
class FlatImage {
  readonly pixels: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }
  write(rect: Rect, data: Uint8ClampedArray) {
    for (let y = 0; y < rect.height; y++) {
      for (let x = 0; x < rect.width; x++) {
        const cx = rect.x + x;
        const cy = rect.y + y;
        if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) {
          continue;
        }
        const from = (y * rect.width + x) * 4;
        this.pixels.set(data.subarray(from, from + 4), (cy * this.width + cx) * 4);
      }
    }
  }
}

const whole = (s: TileStore): Rect => ({ x: 0, y: 0, width: s.width, height: s.height });

describe("TileStore", () => {
  it("computes the tile grid size", () => {
    const store = new TileStore(600, 256);
    expect(store.cols).toBe(3);
    expect(store.rows).toBe(1);
  });

  it("rejects invalid sizes", () => {
    expect(() => new TileStore(0, 10)).toThrow(RangeError);
    expect(() => new TileStore(10.5, 10)).toThrow(RangeError);
  });

  it("starts empty and transparent", () => {
    const store = new TileStore(300, 300);
    expect(store.tileCount).toBe(0);
    expect(store.memoryBytes).toBe(0);
    expect(isTransparent(store.readRegion(whole(store)))).toBe(true);
  });

  it("only allocates the tiles that are touched", () => {
    const store = new TileStore(1024, 1024);
    const rect = { x: 250, y: 10, width: 10, height: 10 };
    const touched = store.writeRegion(rect, fill(rect, [255, 0, 0, 255]));
    expect(touched.map(tileCoord)).toEqual([
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
    ]);
    expect(store.tileCount).toBe(2);
    expect(store.memoryBytes).toBe(2 * TILE_SIZE * TILE_SIZE * 4);
  });

  it("frees tiles that become fully transparent", () => {
    const store = new TileStore(512, 512);
    const rect = { x: 0, y: 0, width: 512, height: 512 };
    store.writeRegion(rect, fill(rect, [10, 20, 30, 255]));
    expect(store.tileCount).toBe(4);
    store.writeRegion(rect, fill(rect, [0, 0, 0, 0]));
    expect(store.tileCount).toBe(0);
  });

  it("does not allocate tiles for transparent writes", () => {
    const store = new TileStore(512, 512);
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    store.writeRegion(rect, fill(rect, [0, 0, 0, 0]));
    expect(store.tileCount).toBe(0);
  });

  it("ignores writes outside the canvas", () => {
    const store = new TileStore(100, 100);
    const rect = { x: 200, y: 200, width: 10, height: 10 };
    expect(store.writeRegion(rect, fill(rect, [1, 2, 3, 255]))).toEqual([]);
    expect(store.tileCount).toBe(0);
  });

  it("reads pixels outside the canvas as transparent, even on edge tiles", () => {
    const store = new TileStore(100, 100);
    const rect = { x: 50, y: 50, width: 100, height: 100 };
    store.writeRegion(rect, fill(rect, [9, 9, 9, 255]));
    const outside = store.readRegion({ x: 100, y: 0, width: 50, height: 100 });
    expect(isTransparent(outside)).toBe(true);
  });

  it("rejects mismatched data and non-integer rects", () => {
    const store = new TileStore(100, 100);
    expect(() =>
      store.writeRegion({ x: 0, y: 0, width: 2, height: 2 }, new Uint8ClampedArray(4)),
    ).toThrow(RangeError);
    expect(() => store.readRegion({ x: 0.5, y: 0, width: 2, height: 2 })).toThrow(RangeError);
  });

  it("never mutates a stored tile", () => {
    const store = new TileStore(256, 256);
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    store.writeRegion(rect, fill(rect, [1, 1, 1, 255]));
    const before = store.getTile(0, 0)!;
    const copy = before.slice();
    store.writeRegion(rect, fill(rect, [2, 2, 2, 255]));
    expect(store.getTile(0, 0)).not.toBe(before);
    expect(firstDifference(before, copy)).toBe(-1);
  });

  it("restores snapshots, including tiles that were empty", () => {
    const store = new TileStore(512, 256);
    const a = { x: 0, y: 0, width: 10, height: 10 };
    store.writeRegion(a, fill(a, [1, 2, 3, 255]));
    const before = store.readRegion(whole(store));
    const keys = [tileKey(0, 0), tileKey(1, 0)];
    const snapshot = store.snapshot(keys);

    const b = { x: 0, y: 0, width: 512, height: 256 };
    store.writeRegion(b, fill(b, [7, 7, 7, 255]));
    expect(store.restore(snapshot)).toEqual(keys);
    expect(firstDifference(store.readRegion(whole(store)), before)).toBe(-1);
    expect(store.tileCount).toBe(1);
  });

  it("behaves like a flat image for any sequence of writes (property)", () => {
    const write = fc.record({
      x: fc.integer({ min: -100, max: 650 }),
      y: fc.integer({ min: -100, max: 650 }),
      width: fc.integer({ min: 0, max: 300 }),
      height: fc.integer({ min: 0, max: 300 }),
      seed: fc.integer({ min: 0, max: 255 }),
      alpha: fc.constantFrom(0, 1, 128, 255),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1, max: 600 }),
        fc.array(write, { maxLength: 8 }),
        (width, height, writes) => {
          const store = new TileStore(width, height);
          const model = new FlatImage(width, height);
          for (const w of writes) {
            const data = pattern(w, w.seed, w.alpha);
            store.writeRegion(w, data);
            model.write(w, data);
          }
          expect(firstDifference(store.readRegion(whole(store)), model.pixels)).toBe(-1);
          for (const key of store.keys()) {
            const { tx, ty } = tileCoord(key);
            expect(isTransparent(store.getTile(tx, ty)!)).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("restores the exact previous state after any write (property)", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -50, max: 500 }),
          y: fc.integer({ min: -50, max: 500 }),
          width: fc.integer({ min: 1, max: 300 }),
          height: fc.integer({ min: 1, max: 300 }),
          seed: fc.integer({ min: 0, max: 255 }),
        }),
        (w) => {
          const store = new TileStore(520, 520);
          const base = { x: 100, y: 100, width: 200, height: 200 };
          store.writeRegion(base, pattern(base, 42, 255));
          const before = store.readRegion(whole(store));

          const snapshot = store.snapshot(store.tilesIn(w).map(({ tx, ty }) => tileKey(tx, ty)));
          store.writeRegion(w, pattern(w, w.seed, 255));
          store.restore(snapshot);
          expect(firstDifference(store.readRegion(whole(store)), before)).toBe(-1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("tile keys", () => {
  it("round-trips coordinates", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 65535 }),
        fc.integer({ min: 0, max: 65535 }),
        (tx, ty) => {
          expect(tileCoord(tileKey(tx, ty))).toEqual({ tx, ty });
        },
      ),
    );
  });
});
