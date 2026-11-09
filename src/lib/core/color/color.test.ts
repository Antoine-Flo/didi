import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromHex, hsvToRgb, rgbToHsv, toHex, type RGB } from "./color";

const rgb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
) as fc.Arbitrary<RGB>;

describe("color", () => {
  it("converts to and from hex", () => {
    expect(toHex([255, 128, 0])).toBe("#ff8000");
    expect(fromHex("#FF8000")).toEqual([255, 128, 0]);
    expect(fromHex(" ff8000 ")).toEqual([255, 128, 0]);
    for (const bad of ["nope", "#ff80", "#ff80001", "ggg000", ""]) {
      expect(fromHex(bad)).toBeNull();
    }
  });

  it("converts known colors to HSV", () => {
    expect(rgbToHsv([255, 0, 0])).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv([0, 255, 0])).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv([0, 0, 255])).toEqual({ h: 240, s: 1, v: 1 });
    expect(rgbToHsv([255, 0, 255]).h).toBe(300);
    expect(rgbToHsv([0, 0, 0])).toEqual({ h: 0, s: 0, v: 0 });
    expect(rgbToHsv([255, 255, 255])).toEqual({ h: 0, s: 0, v: 1 });
    expect(hsvToRgb({ h: 30, s: 1, v: 1 })).toEqual([255, 128, 0]);
  });

  it("round-trips every RGB color through HSV and hex", () => {
    fc.assert(
      fc.property(rgb, (color) => {
        expect(hsvToRgb(rgbToHsv(color))).toEqual(color);
        expect(fromHex(toHex(color))).toEqual(color);
      }),
      { numRuns: 2000 },
    );
  });

  it("keeps HSV in range", () => {
    fc.assert(
      fc.property(rgb, (color) => {
        const { h, s, v } = rgbToHsv(color);
        expect(h >= 0 && h < 360 && s >= 0 && s <= 1 && v >= 0 && v <= 1).toBe(true);
      }),
    );
  });
});
