// The free shape of a selection (the lasso), inside its rectangle.
//
// It is kept as a path, in fractions of the rectangle: it follows the rectangle when an edge
// moves or the content is scaled. The pixels it selects come from that path: those it goes
// through, and those it surrounds.

import type { Rect } from "../geometry";
import type { Point } from "./placement";

export interface SelectionShape {
  /** The closed path, in fractions of the rectangle, 0 to 1. */
  readonly points: readonly Point[];
}

/** A straight piece of an outline, in pixels from the rectangle's top left corner. */
export interface OutlineRun {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A shape from a path on the canvas, cut to `rect`. */
export function shapeFrom(points: readonly Point[], rect: Rect): SelectionShape {
  return {
    points: points.map((p) => ({
      x: clamp01((p.x - rect.x) / rect.width),
      y: clamp01((p.y - rect.y) / rect.height),
    })),
  };
}

/**
 * What a path on the canvas would select once closed by a straight line. Its points are pixel
 * centers. Null: it takes two pixels to make a selection.
 */
export function pathSelection(
  path: readonly Point[],
): { rect: Rect; shape: SelectionShape } | null {
  if (path.length < 2) return null;
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  const rect = {
    x,
    y,
    width: Math.ceil(Math.max(...xs)) - x,
    height: Math.ceil(Math.max(...ys)) - y,
  };
  return { rect, shape: shapeFrom(path, rect) };
}

/** Marks the pixels of a line, without gaps. */
function markLine(
  mask: Uint8Array,
  width: number,
  height: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.floor(a.x + ((b.x - a.x) * i) / steps);
    const y = Math.floor(a.y + ((b.y - a.y) * i) / steps);
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
  }
}

function buildMask({ points }: SelectionShape, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const local = points.map((p) => ({ x: p.x * width, y: p.y * height }));
  // What it surrounds: the pixels whose center is inside, row by row. Each piece of the path is
  // only looked at for the rows it reaches: a long path has a lot of short pieces.
  const rows: number[][] = Array.from({ length: height }, () => []);
  local.forEach((a, i) => {
    const b = local[(i + 1) % local.length];
    const first = Math.max(0, Math.ceil(Math.min(a.y, b.y) - 0.5));
    const last = Math.min(height - 1, Math.floor(Math.max(a.y, b.y) - 0.5));
    for (let y = first; y <= last; y++) {
      const center = y + 0.5;
      if (a.y <= center === b.y <= center) continue;
      rows[y].push(a.x + ((center - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  });
  for (let y = 0; y < height; y++) {
    const crossings = rows[y].sort((u, v) => u - v);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const to = Math.min(width - 1, Math.floor(crossings[i + 1] - 0.5));
      if (to >= from) mask.fill(1, y * width + from, y * width + to + 1);
    }
  }
  // What it goes through.
  local.forEach((a, i) => markLine(mask, width, height, a, local[(i + 1) % local.length]));
  return mask;
}

const masks = new WeakMap<SelectionShape, { width: number; height: number; mask: Uint8Array }>();

/** Which pixels of `rect` are selected: 1 for yes, row by row. Kept until the size changes. */
export function shapeMask(rect: Rect, shape: SelectionShape): Uint8Array {
  const { width, height } = rect;
  const known = masks.get(shape);
  if (known && known.width === width && known.height === height) return known.mask;
  const mask = buildMask(shape, width, height);
  masks.set(shape, { width, height, mask });
  return mask;
}

/** The outline of a mask: the edges between selected pixels and the others, merged in runs. */
export function maskOutline(mask: Uint8Array, width: number, height: number): OutlineRun[] {
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  const runs: OutlineRun[] = [];
  for (let y = 0; y <= height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const edge = x < width && at(x, y - 1) !== at(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        runs.push({ x0: start, y0: y, x1: x, y1: y });
        start = -1;
      }
    }
  }
  for (let x = 0; x <= width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const edge = y < height && at(x - 1, y) !== at(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        runs.push({ x0: x, y0: start, x1: x, y1: y });
        start = -1;
      }
    }
  }
  return runs;
}
