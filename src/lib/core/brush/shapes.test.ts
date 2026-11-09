import { describe, expect, it } from "vitest";
import type { Pixel } from "#lib/core/brush/pixel-path.js";
import {
  ellipseOutline,
  ellipseSpans,
  rectOutline,
  shapeBox,
  snapLineEnd,
  squareEnd,
  type PixelBox,
} from "#lib/core/brush/shapes.js";

const keys = (pixels: Pixel[]) => new Set(pixels.map((p) => `${p.x},${p.y}`));

describe("constraints", () => {
  it("snap lines to pixel-art angles, a whole number of steps away", () => {
    const a = { x: 10, y: 10 };
    expect(snapLineEnd(a, { x: 20, y: 11 })).toEqual({ x: 20, y: 10 });
    expect(snapLineEnd(a, { x: 10, y: 3 })).toEqual({ x: 10, y: 3 });
    expect(snapLineEnd(a, { x: 16, y: 18 })).toEqual({ x: 17, y: 17 });
    expect(snapLineEnd(a, { x: 2, y: 6 })).toEqual({ x: 2, y: 6 });
    // 2:1, regular stairs of two pixels.
    expect(snapLineEnd(a, { x: 19, y: 15 })).toEqual({ x: 20, y: 15 });
    expect(snapLineEnd(a, a)).toEqual(a);
  });

  it("make squares from the larger side", () => {
    expect(squareEnd({ x: 0, y: 0 }, { x: 5, y: -2 })).toEqual({ x: 5, y: -5 });
    expect(squareEnd({ x: 0, y: 0 }, { x: 0, y: 3 })).toEqual({ x: 3, y: 3 });
  });

  it("give boxes from a corner or from the center", () => {
    expect(shapeBox({ x: 5, y: 5 }, { x: 2, y: 9 })).toEqual({ x0: 2, y0: 5, x1: 5, y1: 9 });
    expect(shapeBox({ x: 5, y: 5 }, { x: 7, y: 6 }, { fromCenter: true })).toEqual({
      x0: 3,
      y0: 4,
      x1: 7,
      y1: 6,
    });
    expect(shapeBox({ x: 0, y: 0 }, { x: 4, y: 1 }, { square: true })).toEqual({
      x0: 0,
      y0: 0,
      x1: 4,
      y1: 4,
    });
  });
});

describe("rectangles", () => {
  it("outline each border pixel once", () => {
    const pixels = rectOutline({ x0: 0, y0: 0, x1: 3, y1: 2 });
    expect(pixels).toHaveLength(10);
    expect(keys(pixels).size).toBe(10);
    expect(rectOutline({ x0: 1, y0: 1, x1: 1, y1: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("ellipses", () => {
  const boxes: PixelBox[] = [
    { x0: 0, y0: 0, x1: 0, y1: 0 },
    { x0: 0, y0: 0, x1: 1, y1: 1 },
    { x0: 0, y0: 0, x1: 4, y1: 2 },
    { x0: 0, y0: 0, x1: 7, y1: 7 },
    { x0: 3, y0: 2, x1: 18, y1: 7 },
    { x0: 0, y0: 0, x1: 2, y1: 11 },
  ];

  it("stay in their box, touch its four sides, and are symmetric", () => {
    for (const box of boxes) {
      const set = keys(ellipseOutline(box));
      const pixels = [...set].map((k) => k.split(",").map(Number));
      for (const [x, y] of pixels) {
        expect(x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1, `${x},${y}`).toBe(true);
        expect(set.has(`${box.x0 + box.x1 - x},${y}`)).toBe(true);
        expect(set.has(`${x},${box.y0 + box.y1 - y}`)).toBe(true);
      }
      expect(pixels.some(([x]) => x === box.x0)).toBe(true);
      expect(pixels.some(([x]) => x === box.x1)).toBe(true);
      expect(pixels.some(([, y]) => y === box.y0)).toBe(true);
      expect(pixels.some(([, y]) => y === box.y1)).toBe(true);
    }
  });

  it("fill every row of their box", () => {
    for (const box of boxes) {
      const spans = ellipseSpans(box);
      for (let y = box.y0; y <= box.y1; y++) {
        expect(spans.has(y), `row ${y}`).toBe(true);
      }
    }
  });
});
