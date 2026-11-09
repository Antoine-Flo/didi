import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MAX_ZOOM, MIN_ZOOM } from "./camera";
import { FREE_FROM, isFreeZoom, snapZoomDown, snapZoomNearest, stepZoom } from "./pixel-zoom";

const dprs = fc.constantFrom(1, 1.25, 1.5, 2, 3);
const zooms = fc.double({ min: MIN_ZOOM, max: MAX_ZOOM, noNaN: true });

/** A level: a whole number of device pixels per canvas pixel, or 1/n. */
function isLevel(zoom: number, dpr: number): boolean {
  const d = zoom * dpr;
  const n = d >= 1 ? d : 1 / d;
  return Math.abs(n - Math.round(n)) < 1e-6;
}

describe("pixel zoom", () => {
  it("leaves free zooms alone", () => {
    expect(snapZoomDown(9.48, 1)).toBe(9.48);
    expect(snapZoomNearest(9.48, 1)).toBe(9.48);
    expect(snapZoomDown(3, 3)).toBe(3);
  });

  it("snaps a fit down to a whole level", () => {
    expect(snapZoomDown(3.4, 1)).toBe(3);
    expect(snapZoomDown(0.8, 1)).toBe(0.5);
    expect(snapZoomDown(0.3, 1)).toBe(0.25);
    // 1.5× screen: 3.4 CSS = 5.1 device pixels, down to 5.
    expect(snapZoomDown(3.4, 1.5)).toBeCloseTo(5 / 1.5);
  });

  it("snaps a pinch to the nearest level", () => {
    expect(snapZoomNearest(2.4, 1)).toBe(2);
    expect(snapZoomNearest(2.6, 1)).toBe(3);
    expect(snapZoomNearest(7.6, 1)).toBe(FREE_FROM);
    // Nearest by ratio: 0.4 is closer to 1/3 (×1.2) than to 1/2 (×1.25).
    expect(snapZoomNearest(0.4, 1)).toBe(1 / 3);
    expect(snapZoomNearest(0.45, 1)).toBe(0.5);
  });

  it("steps through the levels, then freely", () => {
    const up: number[] = [];
    for (let zoom = 0.25; zoom < 12; zoom = stepZoom(zoom, 1, 1)) {
      up.push(zoom);
    }
    expect(up).toEqual([0.25, 1 / 3, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10]);
    expect(stepZoom(9.5, 1, -1)).toBe(8);
    expect(stepZoom(8, 1, -1)).toBe(7);
    expect(stepZoom(2.5, 1, -1)).toBe(2);
    expect(stepZoom(2.5, 1, 1)).toBe(3);
    expect(stepZoom(1, 1, -1)).toBe(0.5);
    expect(stepZoom(20, 1, -1)).toBe(16);
  });

  it("always lands on a level when not free, within the zoom range", () => {
    fc.assert(
      fc.property(zooms, dprs, (zoom, dpr) => {
        for (const z of [
          snapZoomDown(zoom, dpr),
          snapZoomNearest(zoom, dpr),
          stepZoom(zoom, dpr, 1),
          stepZoom(zoom, dpr, -1),
        ]) {
          expect(z).toBeGreaterThanOrEqual(MIN_ZOOM);
          expect(z).toBeLessThanOrEqual(MAX_ZOOM);
          if (!isFreeZoom(z, dpr) && z > MIN_ZOOM) {
            expect(isLevel(z, dpr)).toBe(true);
          }
        }
      }),
    );
  });

  it("never fits bigger, and steps the right way", () => {
    fc.assert(
      fc.property(zooms, dprs, (zoom, dpr) => {
        expect(snapZoomDown(zoom, dpr)).toBeLessThanOrEqual(zoom);
        if (zoom < MAX_ZOOM) {
          expect(stepZoom(zoom, dpr, 1)).toBeGreaterThan(zoom);
        }
        if (zoom > MIN_ZOOM * 1.01) {
          expect(stepZoom(zoom, dpr, -1)).toBeLessThan(zoom);
        }
      }),
    );
  });
});
