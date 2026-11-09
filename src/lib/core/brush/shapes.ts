// Pixel art shapes, like Aseprite's: lines, rectangles and ellipses drawn by dragging from
// one pixel to another, without anti-aliasing. Shift constrains the shape (pixel-art line
// angles, squares, circles); drawing from the center makes the first pixel the middle.

import { pixelLine, type Pixel } from "./pixel-path";

/** A rectangle of whole pixels, both corners included. */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Line directions kept by Shift, as steps: horizontal, vertical, diagonal, and the 2:1
 * slopes common in pixel art, which give regular stairs.
 */
const LINE_STEPS: Pixel[] = [
  { x: 1, y: 0 },
  { x: 2, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: 2 },
  { x: 0, y: 1 },
];

/**
 * The end of a constrained line from `a` towards `b`: along the closest pixel-art direction,
 * a whole number of its steps away, so the stairs stay regular.
 */
export function snapLineEnd(a: Pixel, b: Pixel): Pixel {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return b;
  }
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const angle = Math.atan2(Math.abs(dy), Math.abs(dx));
  let best = LINE_STEPS[0];
  for (const step of LINE_STEPS) {
    const diff = (s: Pixel) => Math.abs(Math.atan2(s.y, s.x) - angle);
    if (diff(step) < diff(best)) {
      best = step;
    }
  }
  // How many steps: the projection of the drag on the direction.
  const length = Math.hypot(best.x, best.y);
  const along = (Math.abs(dx) * best.x + Math.abs(dy) * best.y) / length;
  const n = Math.round(along / length);
  return { x: a.x + sx * best.x * n, y: a.y + sy * best.y * n };
}

/** The other corner of a square from `a` towards `b`: the larger side wins. */
export function squareEnd(a: Pixel, b: Pixel): Pixel {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + (Math.sign(dx) || 1) * side, y: a.y + (Math.sign(dy) || 1) * side };
}

/**
 * The box of a rectangle or ellipse dragged from `a` to `b`. `square` keeps the sides
 * equal; `fromCenter` makes `a` the middle of the box.
 */
export function shapeBox(
  a: Pixel,
  b: Pixel,
  { square = false, fromCenter = false } = {},
): PixelBox {
  const end = square ? squareEnd(a, b) : b;
  if (fromCenter) {
    const rx = Math.abs(end.x - a.x);
    const ry = Math.abs(end.y - a.y);
    return { x0: a.x - rx, y0: a.y - ry, x1: a.x + rx, y1: a.y + ry };
  }
  return {
    x0: Math.min(a.x, end.x),
    y0: Math.min(a.y, end.y),
    x1: Math.max(a.x, end.x),
    y1: Math.max(a.y, end.y),
  };
}

/** The pixels of a line, both ends included. */
export function linePixels(a: Pixel, b: Pixel): Pixel[] {
  return pixelLine(a, b);
}

/** The outline of a rectangle, each pixel once. */
export function rectOutline({ x0, y0, x1, y1 }: PixelBox): Pixel[] {
  const pixels: Pixel[] = [];
  for (let x = x0; x <= x1; x++) {
    pixels.push({ x, y: y0 });
    if (y1 !== y0) {
      pixels.push({ x, y: y1 });
    }
  }
  for (let y = y0 + 1; y < y1; y++) {
    pixels.push({ x: x0, y });
    if (x1 !== x0) {
      pixels.push({ x: x1, y });
    }
  }
  return pixels;
}

/**
 * The outline of the ellipse filling a box: one pixel thin, 8-connected and symmetric, for
 * any width and height (Alois Zingl's algorithm). May list a pixel twice.
 */
export function ellipseOutline({ x0, y0, x1, y1 }: PixelBox): Pixel[] {
  const pixels: Pixel[] = [];
  const set = (x: number, y: number) => pixels.push({ x, y });
  let a = x1 - x0;
  const b = y1 - y0;
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  let left = x0;
  let right = x1;
  let bottom = y0 + ((b + 1) >> 1);
  let top = bottom - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  do {
    set(right, bottom);
    set(left, bottom);
    set(left, top);
    set(right, top);
    const e2 = 2 * err;
    if (e2 <= dy) {
      bottom++;
      top--;
      err += dy += a;
    }
    if (e2 >= dx || 2 * err > dy) {
      left++;
      right--;
      err += dx += b1;
    }
  } while (left <= right);
  // Very flat ellipses: finish the tips.
  while (bottom - top <= b) {
    set(left - 1, bottom);
    set(right + 1, bottom++);
    set(left - 1, top);
    set(right + 1, top--);
  }
  return pixels;
}

/** For each row of a filled ellipse, its first and last pixel. */
export function ellipseSpans(box: PixelBox): Map<number, { x0: number; x1: number }> {
  const spans = new Map<number, { x0: number; x1: number }>();
  for (const { x, y } of ellipseOutline(box)) {
    if (y < box.y0 || y > box.y1) {
      continue;
    }
    const span = spans.get(y);
    if (!span) {
      spans.set(y, { x0: x, x1: x });
    } else {
      span.x0 = Math.min(span.x0, x);
      span.x1 = Math.max(span.x1, x);
    }
  }
  return spans;
}
