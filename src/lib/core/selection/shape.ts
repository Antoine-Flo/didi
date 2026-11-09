// The free shape of a selection (a lasso, an inverted selection), inside its rectangle.
//
// It is kept as a mask, at the size it was made at: which pixels of the rectangle are
// selected. When an edge of the rectangle moves, or the content is scaled, the mask is
// stretched to the new size, each pixel taking the one under its center.

import type { Rect } from "#lib/core/geometry.js";
import type { Point } from "#lib/core/selection/placement.js";

export interface SelectionShape {
  /** 1 for a selected pixel, row by row. */
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** A straight piece of an outline, in pixels from the rectangle's top left corner. */
export interface OutlineRun {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A mask as a shape, or null if every pixel is selected: the rectangle is enough. Its mask
 * is kept, not copied.
 */
export function shapeOf(mask: Uint8Array, width: number, height: number): SelectionShape | null {
  return mask.every((v) => v === 1) ? null : { mask, width, height };
}

/** The shape of a closed path on the canvas, in `rect` (see `pathSelection`). */
export function shapeFrom(points: readonly Point[], rect: Rect): SelectionShape {
  const local = points.map((p) => ({ x: p.x - rect.x, y: p.y - rect.y }));
  return { mask: pathMask(local, rect.width, rect.height), width: rect.width, height: rect.height };
}

/**
 * What a path on the canvas would select once closed by a straight line. Its points are pixel
 * centers. Null: it takes two pixels to make a selection.
 */
export function pathSelection(
  path: readonly Point[],
): { rect: Rect; shape: SelectionShape } | null {
  if (path.length < 2) {
    return null;
  }
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
    if (x >= 0 && y >= 0 && x < width && y < height) {
      mask[y * width + x] = 1;
    }
  }
}

/** The pixels a closed path (in pixels of the mask) goes through, and those it surrounds. */
function pathMask(local: readonly Point[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  // What it surrounds: the pixels whose center is inside, row by row. Each piece of the path is
  // only looked at for the rows it reaches: a long path has a lot of short pieces.
  const rows: number[][] = Array.from({ length: height }, () => []);
  local.forEach((a, i) => {
    const b = local[(i + 1) % local.length];
    const first = Math.max(0, Math.ceil(Math.min(a.y, b.y) - 0.5));
    const last = Math.min(height - 1, Math.floor(Math.max(a.y, b.y) - 0.5));
    for (let y = first; y <= last; y++) {
      const center = y + 0.5;
      if (a.y <= center === b.y <= center) {
        continue;
      }
      rows[y].push(a.x + ((center - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  });
  for (let y = 0; y < height; y++) {
    const crossings = rows[y].sort((u, v) => u - v);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const to = Math.min(width - 1, Math.floor(crossings[i + 1] - 0.5));
      if (to >= from) {
        mask.fill(1, y * width + from, y * width + to + 1);
      }
    }
  }
  // What it goes through.
  local.forEach((a, i) => markLine(mask, width, height, a, local[(i + 1) % local.length]));
  return mask;
}

const stretched = new WeakMap<
  SelectionShape,
  { width: number; height: number; mask: Uint8Array }
>();

/**
 * Which pixels of `rect` are selected: 1 for yes, row by row. The shape's own mask at its
 * size; stretched otherwise, and kept until the size changes again.
 */
export function shapeMask(rect: Rect, shape: SelectionShape): Uint8Array {
  const { width, height } = rect;
  if (width === shape.width && height === shape.height) {
    return shape.mask;
  }
  const known = stretched.get(shape);
  if (known && known.width === width && known.height === height) {
    return known.mask;
  }
  const mask = new Uint8Array(width * height);
  const columns = Array.from({ length: width }, (_, x) =>
    Math.min(shape.width - 1, Math.floor(((x + 0.5) * shape.width) / width)),
  );
  for (let y = 0; y < height; y++) {
    const row = Math.min(shape.height - 1, Math.floor(((y + 0.5) * shape.height) / height));
    const from = row * shape.width;
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = shape.mask[from + columns[x]];
    }
  }
  stretched.set(shape, { width, height, mask });
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
      if (edge && start < 0) {
        start = x;
      }
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
      if (edge && start < 0) {
        start = y;
      }
      if (!edge && start >= 0) {
        runs.push({ x0: x, y0: start, x1: x, y1: y });
        start = -1;
      }
    }
  }
  return runs;
}
