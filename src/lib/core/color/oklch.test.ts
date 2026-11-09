import { describe, expect, it } from "vitest";
import type { RGB } from "#lib/core/color/color.js";
import { oklchToRgb, rgbToOklch } from "#lib/core/color/oklch.js";

describe("OKLCH", () => {
  it("goes there and back", () => {
    const colors: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [20, 20, 20],
      [12, 200, 90],
      [70, 40, 230],
    ];
    for (const color of colors) {
      const back = oklchToRgb(rgbToOklch(color));
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(back[i] - color[i]), `${color}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("knows black, white and gray", () => {
    expect(rgbToOklch([255, 255, 255]).l).toBeCloseTo(1, 3);
    expect(rgbToOklch([0, 0, 0]).l).toBeCloseTo(0, 3);
    expect(rgbToOklch([128, 128, 128]).c).toBeLessThan(1e-4);
  });

  it("lowers the chroma of colors out of the gamut, keeping their lightness", () => {
    const vivid = { l: 0.9, c: 0.35, h: 140 };
    const rgb = oklchToRgb(vivid);
    expect(rgbToOklch(rgb).l).toBeCloseTo(0.9, 1);
    expect(rgbToOklch(rgb).c).toBeLessThan(0.35);
  });
});
