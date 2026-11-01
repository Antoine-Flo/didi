import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { premultiply, unpremultiply } from "./pixels";

const pixels = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 400 })
  .map((values) => new Uint8ClampedArray(values.slice(0, values.length - (values.length % 4))));

describe("pixel conversions", () => {
  it("premultiplies known values", () => {
    expect([...premultiply(new Uint8ClampedArray([255, 128, 0, 128]))]).toEqual([128, 64, 0, 128]);
    expect([...premultiply(new Uint8ClampedArray([10, 20, 30, 0]))]).toEqual([0, 0, 0, 0]);
  });

  it("always produces valid premultiplied pixels (property)", () => {
    fc.assert(
      fc.property(pixels, (straight) => {
        const p = premultiply(straight);
        for (let i = 0; i < p.length; i += 4) {
          expect(Math.max(p[i], p[i + 1], p[i + 2])).toBeLessThanOrEqual(p[i + 3]);
        }
      }),
    );
  });

  it("round-trips premultiplied pixels exactly (property)", () => {
    fc.assert(
      fc.property(pixels, (straight) => {
        const p = premultiply(straight);
        expect([...premultiply(unpremultiply(p))]).toEqual([...p]);
      }),
    );
  });

  it("keeps opaque pixels unchanged", () => {
    const opaque = new Uint8ClampedArray([12, 34, 56, 255]);
    expect([...premultiply(opaque)]).toEqual([...opaque]);
    expect([...unpremultiply(opaque)]).toEqual([...opaque]);
  });
});
