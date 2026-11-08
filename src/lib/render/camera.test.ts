import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fit,
  mirrorAt,
  rotateAt,
  setRotationAt,
  toCanvas,
  toScreen,
  visibleRect,
  zoomAt,
  type Camera,
  type Point,
} from "./camera";

const coord = fc.double({ min: -5000, max: 5000, noNaN: true });
const point = fc.record({ x: coord, y: coord });
const camera = fc.record({
  x: coord,
  y: coord,
  zoom: fc.double({ min: MIN_ZOOM, max: MAX_ZOOM, noNaN: true }),
  rotation: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
});

function expectNear(a: Point, b: Point, tolerance = 1e-6) {
  const scale = Math.max(1, Math.abs(b.x), Math.abs(b.y));
  expect(Math.abs(a.x - b.x)).toBeLessThan(tolerance * scale);
  expect(Math.abs(a.y - b.y)).toBeLessThan(tolerance * scale);
}

describe("camera", () => {
  it("maps the canvas origin to the camera position", () => {
    const c: Camera = { x: 10, y: 20, zoom: 2, rotation: 0 };
    expect(toScreen(c, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
    expect(toScreen(c, { x: 5, y: 5 })).toEqual({ x: 20, y: 30 });
  });

  it("rotates clockwise on screen (y down)", () => {
    const c: Camera = { x: 0, y: 0, zoom: 1, rotation: Math.PI / 2 };
    expectNear(toScreen(c, { x: 1, y: 0 }), { x: 0, y: 1 });
  });

  it("converts back and forth without loss (property)", () => {
    fc.assert(
      fc.property(camera, point, (c, p) => {
        expectNear(toCanvas(c, toScreen(c, p)), p);
      }),
    );
  });

  it("keeps the canvas point under the cursor when zooming (property)", () => {
    fc.assert(
      fc.property(
        camera,
        point,
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (c, screen, factor) => {
          const under = toCanvas(c, screen);
          const zoomed = zoomAt(c, screen, factor);
          expectNear(toScreen(zoomed, under), screen);
        },
      ),
    );
  });

  it("keeps the pivot in place when rotating (property)", () => {
    fc.assert(
      fc.property(
        camera,
        point,
        fc.double({ min: -10, max: 10, noNaN: true }),
        (c, pivot, angle) => {
          const under = toCanvas(c, pivot);
          const rotated = rotateAt(c, pivot, angle);
          expectNear(toScreen(rotated, under), pivot);
          expect(rotated.rotation).toBeGreaterThan(-Math.PI - 1e-9);
          expect(rotated.rotation).toBeLessThanOrEqual(Math.PI + 1e-9);
        },
      ),
    );
  });

  it("clamps the zoom", () => {
    const c: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
    expect(zoomAt(c, { x: 0, y: 0 }, 1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(c, { x: 0, y: 0 }, 1e-6).zoom).toBe(MIN_ZOOM);
  });

  it("sets an absolute rotation", () => {
    const c: Camera = { x: 0, y: 0, zoom: 1, rotation: 1 };
    expect(setRotationAt(c, { x: 50, y: 50 }, 0).rotation).toBeCloseTo(0);
  });

  it("fits the canvas centered in the view", () => {
    const c = fit({ width: 1000, height: 500 }, { width: 800, height: 800 }, 1);
    expect(c.zoom).toBe(0.8);
    expectNear(toScreen(c, { x: 500, y: 250 }), { x: 400, y: 400 });
  });

  it("computes the visible canvas pixels", () => {
    const c: Camera = { x: -100, y: -50, zoom: 2, rotation: 0 };
    expect(visibleRect(c, { width: 400, height: 300 }, { width: 1000, height: 1000 })).toEqual({
      x: 50,
      y: 25,
      width: 200,
      height: 150,
    });
    // Clipped to the canvas, or null when the canvas is out of view.
    expect(visibleRect(c, { width: 4000, height: 300 }, { width: 1000, height: 1000 })?.width).toBe(
      950,
    );
    const away: Camera = { x: 5000, y: 0, zoom: 1, rotation: 0 };
    expect(
      visibleRect(away, { width: 400, height: 300 }, { width: 1000, height: 1000 }),
    ).toBeNull();
  });

  it("covers every canvas pixel displayed in the view, even rotated (property)", () => {
    const canvas = { width: 3000, height: 2000 };
    const view = { width: 800, height: 600 };
    fc.assert(
      fc.property(
        camera,
        fc.double({ min: 0, max: 800, noNaN: true, maxExcluded: true }),
        fc.double({ min: 0, max: 600, noNaN: true, maxExcluded: true }),
        (c, sx, sy) => {
          const p = toCanvas(c, { x: sx, y: sy });
          if (p.x < 0 || p.y < 0 || p.x >= canvas.width || p.y >= canvas.height) return;
          const r = visibleRect(c, view, canvas)!;
          expect(r).not.toBeNull();
          expect(Math.floor(p.x)).toBeGreaterThanOrEqual(r.x);
          expect(Math.floor(p.x)).toBeLessThan(r.x + r.width);
          expect(Math.floor(p.y)).toBeGreaterThanOrEqual(r.y);
          expect(Math.floor(p.y)).toBeLessThan(r.y + r.height);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("mirrors around a screen point, and back, round-tripping points", () => {
    const c: Camera = { x: 10, y: 20, zoom: 2, rotation: 0.5 };
    const at = { x: 100, y: 80 };
    const m = mirrorAt(c, at);
    expect(toCanvas(m, at).x).toBeCloseTo(toCanvas(c, at).x);
    const p = { x: 3, y: 7 };
    const back = toCanvas(m, toScreen(m, p));
    expect(back.x).toBeCloseTo(3);
    expect(back.y).toBeCloseTo(7);
    // Left and right swap on the screen.
    expect(toScreen(m, { x: 1, y: 0 }).x - toScreen(m, { x: 0, y: 0 }).x).toBeCloseTo(
      -(toScreen(c, { x: 1, y: 0 }).x - toScreen(c, { x: 0, y: 0 }).x),
    );
    const twice = mirrorAt(m, at);
    expect(twice.mirrored).toBe(false);
    expect(twice.x).toBeCloseTo(c.x);
  });
});
