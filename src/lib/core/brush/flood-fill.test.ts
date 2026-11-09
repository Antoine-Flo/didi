import { describe, expect, it } from "vitest";
import { fillArea } from "./flood-fill";

// 5 × 3: a vertical wall of red at x = 2 splits two transparent areas.
function image(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(5 * 3 * 4);
  for (let y = 0; y < 3; y++) {
    data.set([255, 0, 0, 255], (y * 5 + 2) * 4);
  }
  return data;
}

const count = (mask: Uint8Array) => mask.reduce((n, v) => n + v, 0);

describe("fillArea", () => {
  it("fills the connected area of the clicked color", () => {
    const area = fillArea(image(), 5, 3, 0, 0, { tolerance: 0, contiguous: true })!;
    expect(count(area.mask)).toBe(6);
    expect(area.bounds).toEqual({ x: 0, y: 0, width: 2, height: 3 });
  });

  it("fills every pixel of that color when not contiguous", () => {
    const area = fillArea(image(), 5, 3, 0, 0, { tolerance: 0, contiguous: false })!;
    expect(count(area.mask)).toBe(12);
    expect(area.bounds).toEqual({ x: 0, y: 0, width: 5, height: 3 });
  });

  it("takes close colors within the tolerance", () => {
    const data = image();
    data.set([250, 0, 0, 255], (1 * 5 + 3) * 4);
    const exact = fillArea(data, 5, 3, 2, 0, { tolerance: 0, contiguous: true })!;
    expect(count(exact.mask)).toBe(3);
    const close = fillArea(data, 5, 3, 2, 0, { tolerance: 8, contiguous: true })!;
    expect(count(close.mask)).toBe(4);
  });

  it("does nothing outside the image", () => {
    expect(fillArea(image(), 5, 3, 5, 0, { tolerance: 0, contiguous: true })).toBeNull();
  });
});
