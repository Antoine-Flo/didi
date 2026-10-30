// Places brush dabs at regular intervals along a segment.

export interface Point {
  x: number;
  y: number;
}

export interface DabRun {
  dabs: Point[];
  /** Distance already travelled since the last dab, to carry to the next segment. */
  carry: number;
}

/**
 * Returns the dab positions on the segment from `from` to `to`, spaced by `spacing`.
 * `carry` is the distance travelled since the last dab on the previous segment.
 */
export function placeDabs(from: Point, to: Point, spacing: number, carry: number): DabRun {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const step = Math.max(spacing, 0.1);
  const dabs: Point[] = [];
  let d = step - carry;
  while (d <= length) {
    const t = d / length;
    dabs.push({ x: from.x + dx * t, y: from.y + dy * t });
    d += step;
  }
  return { dabs, carry: length - (d - step) };
}
