// Where floating content is shown: a box, in pixels, and possibly a rotation and a skew.
//
// The box lives in its own "frame": a point (x, y) of it shows at
//   (a x + b y + tx, c x + d y + ty)
// on the canvas. Without a transform, the frame is the canvas. Keeping the box apart from the
// transform lets a handle scale along the sides of rotated content, in whole pixels.

import type { Rect } from "../geometry";

export interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

import type { Point } from "../geometry";

export type { Point };

/** Any rectangle is a placement, without a transform. */
export interface Placement extends Rect {
  readonly transform?: Transform | null;
}

const EPSILON = 1e-6;

/** From the box to the canvas. */
export function toCanvas({ transform: m }: Placement, x: number, y: number): Point {
  return m ? { x: m.a * x + m.b * y + m.tx, y: m.c * x + m.d * y + m.ty } : { x, y };
}

/** A direction from the box to the canvas: without the translation. */
function directionToCanvas({ transform: m }: Placement, x: number, y: number): Point {
  return m ? { x: m.a * x + m.b * y, y: m.c * x + m.d * y } : { x, y };
}

/** A direction from the canvas to the box. */
function directionToBox({ transform: m }: Placement, x: number, y: number): Point {
  if (!m) {
    return { x, y };
  }
  const det = m.a * m.d - m.b * m.c;
  return { x: (m.d * x - m.b * y) / det, y: (m.a * y - m.c * x) / det };
}

/** From the canvas to the box. */
export function toBox(p: Placement, x: number, y: number): Point {
  const m = p.transform;
  return m ? directionToBox(p, x - m.tx, y - m.ty) : { x, y };
}

/** The direction of a vector of the box on the canvas, as a unit vector. */
export function outward(p: Placement, x: number, y: number): Point {
  const v = directionToCanvas(p, x, y);
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

/** The box's corners on the canvas, clockwise from the top left. */
export function corners(p: Placement): Point[] {
  const right = p.x + p.width;
  const bottom = p.y + p.height;
  return [
    toCanvas(p, p.x, p.y),
    toCanvas(p, right, p.y),
    toCanvas(p, right, bottom),
    toCanvas(p, p.x, bottom),
  ];
}

export function centerOf(p: Placement): Point {
  return toCanvas(p, p.x + p.width / 2, p.y + p.height / 2);
}

/** The smallest rectangle of whole pixels around it on the canvas. */
export function boundsOf(p: Placement): Rect {
  const points = corners(p);
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  const x = Math.floor(Math.min(...xs) + EPSILON);
  const y = Math.floor(Math.min(...ys) + EPSILON);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(Math.max(...xs) - EPSILON) - x),
    height: Math.max(1, Math.ceil(Math.max(...ys) - EPSILON) - y),
  };
}

export function contains(p: Placement, x: number, y: number): boolean {
  const q = toBox(p, x, y);
  return q.x >= p.x && q.x < p.x + p.width && q.y >= p.y && q.y < p.y + p.height;
}

export function samePlacement(a: Placement | null, b: Placement | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const same = a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const m = a.transform;
  const n = b.transform;
  if (!same || !m !== !n) {
    return false;
  }
  return (
    !m ||
    !n ||
    (m.a === n.a && m.b === n.b && m.c === n.c && m.d === n.d && m.tx === n.tx && m.ty === n.ty)
  );
}

/** Back to a plain rectangle when the transform has become none, e.g. rotated back to 0°. */
function simplified(box: Rect, m: Transform): Placement {
  const near = (u: number, v: number) => Math.abs(u - v) < EPSILON;
  if (near(m.a, 1) && near(m.b, 0) && near(m.c, 0) && near(m.d, 1)) {
    return { ...box, x: box.x + Math.round(m.tx), y: box.y + Math.round(m.ty) };
  }
  return { ...box, transform: m };
}

const boxOf = ({ x, y, width, height }: Placement): Rect => ({ x, y, width, height });
const NONE: Transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function moved(p: Placement, dx: number, dy: number): Placement {
  const m = p.transform;
  if (!m) {
    return { ...boxOf(p), x: p.x + dx, y: p.y + dy };
  }
  return { ...p, transform: { ...m, tx: m.tx + dx, ty: m.ty + dy } };
}

/** Rotated around a point of the canvas, in radians, clockwise on screen. */
export function rotated(p: Placement, pivot: Point, angle: number): Placement {
  const m = p.transform ?? NONE;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = m.tx - pivot.x;
  const ry = m.ty - pivot.y;
  return simplified(boxOf(p), {
    a: cos * m.a - sin * m.c,
    b: cos * m.b - sin * m.d,
    c: sin * m.a + cos * m.c,
    d: sin * m.b + cos * m.d,
    tx: pivot.x + cos * rx - sin * ry,
    ty: pivot.y + sin * rx + cos * ry,
  });
}

/**
 * Skewed by moving one side along itself by the canvas vector (dx, dy), the opposite side
 * staying in place.
 */
export function skewed(
  p: Placement,
  side: "n" | "e" | "s" | "w",
  dx: number,
  dy: number,
): Placement {
  const m = p.transform ?? NONE;
  const q = directionToBox(p, dx, dy);
  const right = p.x + p.width;
  const bottom = p.y + p.height;
  if (side === "n" || side === "s") {
    // x moves in proportion to the distance from the opposite side.
    const anchor = side === "n" ? bottom : p.y;
    const k = q.x / ((side === "n" ? p.y : bottom) - anchor);
    return simplified(boxOf(p), {
      ...m,
      b: m.a * k + m.b,
      d: m.c * k + m.d,
      tx: m.tx - k * anchor * m.a,
      ty: m.ty - k * anchor * m.c,
    });
  }
  const anchor = side === "w" ? right : p.x;
  const k = q.y / ((side === "w" ? p.x : right) - anchor);
  return simplified(boxOf(p), {
    ...m,
    a: m.a + m.b * k,
    c: m.c + m.d * k,
    tx: m.tx - k * anchor * m.b,
    ty: m.ty - k * anchor * m.d,
  });
}

/**
 * Mirrored across lines of the box: a vertical one at `x`, a horizontal one at `y`, or both.
 * The box itself stays the same. Mirrored twice, it is back to a plain rectangle.
 */
export function mirrored(p: Placement, x: number | null, y: number | null): Placement {
  let m = p.transform ?? NONE;
  if (x !== null) {
    m = { ...m, a: -m.a, c: -m.c, tx: m.tx + m.a * 2 * x, ty: m.ty + m.c * 2 * x };
  }
  if (y !== null) {
    m = { ...m, b: -m.b, d: -m.d, tx: m.tx + m.b * 2 * y, ty: m.ty + m.d * 2 * y };
  }
  return simplified(boxOf(p), m);
}

/** A canvas vector along the box's sides, in whole pixels: to scale it with a handle. */
export function boxDelta(p: Placement, dx: number, dy: number): Point {
  const q = directionToBox(p, dx, dy);
  return { x: Math.round(q.x), y: Math.round(q.y) };
}
