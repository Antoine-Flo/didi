import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PixelPathBuilder, pixelLine, type Pixel } from "./pixel-path";

describe("pixel paths", () => {
  const key = (p: Pixel) => `${p.x},${p.y}`;
  const touches = (a: Pixel, b: Pixel) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;

  it("draws Bresenham lines including both ends", () => {
    expect(pixelLine({ x: 0, y: 0 }, { x: 3, y: 1 }).map(key)).toEqual([
      "0,0",
      "1,0",
      "2,1",
      "3,1",
    ]);
    expect(pixelLine({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it("removes L corners in pixel-perfect mode", () => {
    const path = new PixelPathBuilder(true);
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ])
      path.add(x, y);
    expect(path.pixels.map(key)).toEqual(["0,0", "1,1", "2,2"]);
    const raw = new PixelPathBuilder(false);
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [1, 1],
    ])
      raw.add(x, y);
    expect(raw.pixels.map(key)).toEqual(["0,0", "1,0", "1,1"]);
  });

  it("reports already painted corners so they can be restored", () => {
    const path = new PixelPathBuilder(true);
    path.add(0, 0);
    expect(path.add(1, 0)).toEqual({ paint: [{ x: 1, y: 0 }], unpaint: [] });
    expect(path.add(1, 1)).toEqual({ paint: [{ x: 1, y: 1 }], unpaint: [{ x: 1, y: 0 }] });
  });

  it("ignores samples within the same pixel", () => {
    const path = new PixelPathBuilder(true);
    path.add(3.2, 4.9);
    expect(path.add(3.8, 4.1)).toEqual({ paint: [], unpaint: [] });
  });

  const samples = fc.array(
    fc.record({
      x: fc.double({ min: -50, max: 50, noNaN: true }),
      y: fc.double({ min: -50, max: 50, noNaN: true }),
    }),
    { minLength: 1, maxLength: 20 },
  );

  it("stays a connected chain without corners, from the first to the last sample (property)", () => {
    fc.assert(
      fc.property(samples, fc.boolean(), (points, pixelPerfect) => {
        const path = new PixelPathBuilder(pixelPerfect);
        for (const p of points) path.add(p.x, p.y);
        const pixels = path.pixels;
        expect(key(pixels[0])).toBe(
          key({ x: Math.floor(points[0].x), y: Math.floor(points[0].y) }),
        );
        const last = points.at(-1)!;
        expect(key(pixels.at(-1)!)).toBe(key({ x: Math.floor(last.x), y: Math.floor(last.y) }));
        for (let i = 1; i < pixels.length; i++)
          expect(touches(pixels[i - 1], pixels[i])).toBe(true);
        if (pixelPerfect) {
          for (let i = 2; i < pixels.length; i++) {
            const [a, b, c] = [pixels[i - 2], pixels[i - 1], pixels[i]];
            const side = (p: Pixel, q: Pixel) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
            expect(side(a, b) && side(b, c) && touches(a, c) && !side(a, c)).toBe(false);
          }
        }
      }),
    );
  });

  it("paint and unpaint describe exactly the final path (property)", () => {
    fc.assert(
      fc.property(samples, (points) => {
        const path = new PixelPathBuilder(true);
        const painted = new Map<string, number>();
        for (const p of points) {
          const { paint, unpaint } = path.add(p.x, p.y);
          for (const q of paint) painted.set(key(q), (painted.get(key(q)) ?? 0) + 1);
          for (const q of unpaint) painted.set(key(q), (painted.get(key(q)) ?? 0) - 1);
        }
        const expected = new Set(path.pixels.map(key));
        const actual = new Set([...painted].filter(([, n]) => n > 0).map(([k]) => k));
        expect(actual).toEqual(expected);
      }),
    );
  });
});
