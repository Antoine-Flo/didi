import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "#lib/core/file/png.js";
import { PNG_FIXTURES } from "#lib/core/testing/png-fixtures.js";

const image = (width: number, height: number, fill: (i: number) => number) => ({
  width,
  height,
  data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => fill(i)),
});

describe("png", () => {
  it("round-trips any RGBA image", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer(),
        (width, height, seed) => {
          // Mixes smooth areas (filters matter) and noise.
          const img = image(width, height, (i) =>
            i % 7 === 0 ? (seed * (i + 1) * 2654435761) >>> 24 : (i >> 2) + seed,
          );
          const back = decodePng(encodePng(img));
          expect(back.width).toBe(width);
          expect(back.height).toBe(height);
          expect(back.data).toEqual(img.data);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("compresses empty and smooth images well", () => {
    const empty = encodePng(image(1024, 1024, () => 0));
    expect(empty.length).toBeLessThan(10_000);
  });

  it("reads PNGs written by other programs, in every common format", () => {
    for (const [name, { png, w, h, rgba }] of Object.entries(PNG_FIXTURES)) {
      const decoded = decodePng(Uint8Array.from(Buffer.from(png, "base64")));
      expect([decoded.width, decoded.height], name).toEqual([w, h]);
      expect([...decoded.data], name).toEqual(rgba);
    }
  });

  it("rejects invalid, truncated and corrupted files", () => {
    const good = encodePng(image(8, 8, (i) => i));
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/Not a PNG/);
    expect(() => decodePng(good.subarray(0, good.length - 20))).toThrow(/Truncated/);
    const corrupted = good.slice();
    corrupted[40] ^= 0xff;
    expect(() => decodePng(corrupted)).toThrow(/Corrupted/);
  });

  it("rejects wrong sizes when encoding", () => {
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(3) })).toThrow();
    expect(() => encodePng({ width: 0, height: 2, data: new Uint8ClampedArray(0) })).toThrow();
  });
});
