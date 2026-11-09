// The triangle of the color wheel (like Krita's): black at the top, white at the bottom left,
// the pure hue at the bottom right, inscribed in a circle. In coordinates from 0 to 1 across
// the wheel, centered on (0.5, 0.5).
//
// A point's weights toward the three corners (barycentric coordinates) give the color: the
// hue's weight is s·v, white's (1 - s)·v, black's 1 - v. Mixing the corners' RGB with these
// weights is exactly the HSV color, so the drawing and the picking agree.

import { hsvToRgb } from "#lib/core/color/color.js";

type Point = { x: number; y: number };

/** The corners for a circle of `radius` around the center: black, white, hue. */
export function triangleCorners(radius: number): { black: Point; white: Point; hue: Point } {
  const side = radius * Math.sin(Math.PI / 3);
  return {
    black: { x: 0.5, y: 0.5 - radius },
    white: { x: 0.5 - side, y: 0.5 + radius / 2 },
    hue: { x: 0.5 + side, y: 0.5 + radius / 2 },
  };
}

type Corners = ReturnType<typeof triangleCorners>;

/** Weights toward the hue, white and black corners: summing to 1, negative outside. */
function weights({ black, white, hue }: Corners, { x, y }: Point): [number, number, number] {
  const d = (white.y - black.y) * (hue.x - black.x) - (white.x - black.x) * (hue.y - black.y);
  const h = ((white.y - black.y) * (x - black.x) - (white.x - black.x) * (y - black.y)) / d;
  const w = ((y - black.y) * (hue.x - black.x) - (x - black.x) * (hue.y - black.y)) / d;
  return [h, w, 1 - h - w];
}

/** Where saturation `s` and value `v` are in the triangle. */
export function trianglePoint(radius: number, s: number, v: number): Point {
  const { black, white, hue } = triangleCorners(radius);
  const h = s * v;
  const w = (1 - s) * v;
  const b = 1 - v;
  return {
    x: h * hue.x + w * white.x + b * black.x,
    y: h * hue.y + w * white.y + b * black.y,
  };
}

/**
 * The saturation and value at a point, brought back into the triangle if outside. Where the
 * saturation means nothing (black), `s` is kept.
 */
export function triangleColor(radius: number, point: Point, s: number): { s: number; v: number } {
  const clamped = weights(triangleCorners(radius), point).map((w) => Math.max(0, w));
  const sum = clamped[0] + clamped[1] + clamped[2];
  const [h, w] = clamped.map((c) => c / sum);
  const v = Math.min(1, h + w);
  return { s: v > 0 ? Math.min(1, h / v) : s, v };
}

/**
 * Paints the triangle for a hue into `pixels` (RGBA, `size` × `size`, covering the wheel).
 * Outside it, transparent.
 */
export function paintTriangle(pixels: Uint8ClampedArray, size: number, radius: number, h: number) {
  const [hr, hg, hb] = hsvToRgb({ h, s: 1, v: 1 });
  const corners = triangleCorners(radius);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [wh, ww, wb] = weights(corners, { x: (px + 0.5) / size, y: (py + 0.5) / size });
      const i = (py * size + px) * 4;
      // Slightly outside still counts, half covered: a smoother edge.
      const edge = Math.min(wh, ww, wb) * size * radius;
      if (edge < -0.5) {
        pixels[i + 3] = 0;
        continue;
      }
      const h1 = Math.max(0, wh);
      const w1 = Math.max(0, ww);
      const sum = h1 + w1 + Math.max(0, wb);
      pixels[i] = ((h1 * hr + w1 * 255) / sum) | 0;
      pixels[i + 1] = ((h1 * hg + w1 * 255) / sum) | 0;
      pixels[i + 2] = ((h1 * hb + w1 * 255) / sum) | 0;
      pixels[i + 3] = edge >= 0.5 ? 255 : Math.round((edge + 0.5) * 255);
    }
  }
}
