import { describe, expect, it } from "vitest";
import { hsvToRgb } from "#lib/core/color/color.js";
import {
  paintTriangle,
  triangleColor,
  triangleCorners,
  trianglePoint,
} from "#lib/app/panels/color-triangle.js";

const R = 0.43;

describe("color triangle", () => {
  it("puts black, white and the hue at the corners", () => {
    const c = triangleCorners(R);
    expect(trianglePoint(R, 0.3, 0)).toEqual(c.black);
    expect(trianglePoint(R, 0, 1)).toEqual(c.white);
    expect(trianglePoint(R, 1, 1)).toEqual(c.hue);
  });

  it("finds back the saturation and value of a point", () => {
    for (const [s, v] of [
      [0.5, 0.5],
      [0.1, 0.9],
      [1, 0.25],
      [0, 0.6],
    ]) {
      const color = triangleColor(R, trianglePoint(R, s, v), 0);
      expect(color.s).toBeCloseTo(s, 6);
      expect(color.v).toBeCloseTo(v, 6);
    }
  });

  it("brings points outside back in, and keeps the saturation at black", () => {
    expect(triangleColor(R, { x: 0.5, y: 0 }, 0.4)).toEqual({ s: 0.4, v: 0 });
    const right = triangleColor(R, { x: 1, y: 0.5 + R / 2 }, 0);
    expect(right.s).toBeCloseTo(1, 6);
    expect(right.v).toBeCloseTo(1, 6);
  });

  it("paints the HSV color of each point", () => {
    const size = 64;
    const pixels = new Uint8ClampedArray(size * size * 4);
    paintTriangle(pixels, size, R, 200);
    const at = (x: number, y: number) => {
      const i = (Math.floor(y * size) * size + Math.floor(x * size)) * 4;
      return [...pixels.slice(i, i + 4)];
    };
    const p = trianglePoint(R, 0.6, 0.7);
    const [r, g, b, a] = at(p.x, p.y);
    const expected = hsvToRgb({ h: 200, s: 0.6, v: 0.7 });
    expect(a).toBe(255);
    for (const [i, c] of [r, g, b].entries()) {
      expect(Math.abs(c - expected[i])).toBeLessThanOrEqual(8);
    }
    expect(at(0.02, 0.02)[3]).toBe(0);
  });
});
