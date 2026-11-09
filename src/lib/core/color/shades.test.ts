import { describe, expect, it } from "vitest";
import { rgbToOklch } from "./oklch";
import { shade } from "./shades";
import type { RGB } from "./color";

const base: RGB = [180, 90, 60];

describe("shades", () => {
  it("has the base color in the middle", () => {
    for (const kind of ["hue", "chroma", "lightness"] as const) {
      expect(shade(base, kind, 0)).toEqual(base);
    }
  });

  it("darkens and lightens, keeping the hue", () => {
    const { h } = rgbToOklch(base);
    const dark = rgbToOklch(shade(base, "lightness", -1));
    const light = rgbToOklch(shade(base, "lightness", 1));
    expect(dark.l).toBeLessThan(rgbToOklch(base).l);
    expect(light.l).toBeGreaterThan(rgbToOklch(base).l);
    expect(Math.abs(dark.h - h)).toBeLessThan(3);
    expect(Math.abs(light.h - h)).toBeLessThan(3);
  });

  it("gives no hue to grays, only lightness", () => {
    const gray: RGB = [100, 100, 100];
    expect(shade(gray, "chroma", 1)).toEqual(gray);
    expect(shade(gray, "hue", 1)).toEqual(gray);
    const light = shade(gray, "lightness", 1);
    expect(light[0]).toBeGreaterThan(100);
    expect(light[0]).toBe(light[1]);
  });
});
