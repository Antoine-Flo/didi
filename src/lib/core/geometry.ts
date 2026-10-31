/** Axis-aligned rectangle, in pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns the overlap of two rectangles, or null if they don't overlap. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function isIntegerRect(r: Rect): boolean {
  return (
    Number.isInteger(r.x) &&
    Number.isInteger(r.y) &&
    Number.isInteger(r.width) &&
    Number.isInteger(r.height) &&
    r.width >= 0 &&
    r.height >= 0
  );
}
