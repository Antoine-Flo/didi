import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { keepAlpha, premultiply, unpremultiply } from "#lib/core/document/pixels.js";

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

  it("keeps a pixel's opacity and its new color (alpha lock)", () => {
    const before = new Uint8ClampedArray([0, 0, 64, 128]); // half-transparent blue
    const out = new Uint8ClampedArray([255, 0, 0, 255]); // painted opaque red
    keepAlpha(out, 0, before);
    expect([...out]).toEqual([128, 0, 0, 128]);
    // Transparent stays transparent, and erasing changes nothing.
    const empty = new Uint8ClampedArray([255, 0, 0, 255]);
    keepAlpha(empty, 0, undefined);
    expect([...empty]).toEqual([0, 0, 0, 0]);
    const erased = new Uint8ClampedArray([0, 0, 0, 0]);
    keepAlpha(erased, 0, before);
    expect([...erased]).toEqual([...before]);
  });

  it("always leaves a valid pixel with the old opacity (property)", () => {
    fc.assert(
      fc.property(pixels, pixels, (a, b) => {
        const n = Math.min(a.length, b.length);
        const before = premultiply(a.slice(0, n));
        const out = premultiply(b.slice(0, n));
        for (let i = 0; i < n; i += 4) {
          keepAlpha(out, i, before);
          expect(out[i + 3]).toBe(before[i + 3]);
          expect(Math.max(out[i], out[i + 1], out[i + 2])).toBeLessThanOrEqual(out[i + 3]);
        }
      }),
    );
  });
});
