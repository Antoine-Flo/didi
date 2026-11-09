// The thin columns (the tools, the view's buttons) stand against an edge: beside the panels'
// column, or against the window's opposite edge. Dragged by their grip, they follow the
// pointer anywhere, and once dropped go to the nearest side, at the height they were dropped.
// Along an edge, a column's place is a fraction of the free height (0 at the top, 1 at the
// bottom), so it stays in proportion when the window changes size. Two columns on the same
// edge are pushed apart so as not to overlap.

/** Beside the panels' column, or against the window's other edge. */
export type ColumnEdge = "panels" | "opposite";

export interface PlacedColumn {
  height: number;
  /** 0 at the top, 1 at the bottom. */
  position: number;
}

/**
 * The tops of the columns along one edge, in pixels from its top, in the same order: each where
 * its place puts it, then pushed apart by `gap` so that none overlaps another, and kept inside
 * the edge's height while they fit. Whole pixels: a fractional position would blur the icons.
 */
export function columnTops(edgeHeight: number, columns: PlacedColumn[], gap: number): number[] {
  const wanted = columns.map((c) => Math.round(c.position * Math.max(0, edgeHeight - c.height)));
  const order = columns.map((_, i) => i).sort((a, b) => wanted[a] - wanted[b] || a - b);
  const tops = [...wanted];
  // Down from the top: each below the one before.
  let bottom = -Infinity;
  for (const i of order) {
    tops[i] = Math.max(tops[i], bottom + gap);
    bottom = tops[i] + columns[i].height;
  }
  // Up from the bottom: each above the one after, and inside the edge.
  let limit = edgeHeight;
  for (const i of [...order].reverse()) {
    tops[i] = Math.max(0, Math.min(tops[i], limit - columns[i].height));
    limit = tops[i] - gap;
  }
  return tops;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The edge on a side of the window: the panels' one, or the other. */
export function edgeOnSide(side: "left" | "right", panelsOnLeft: boolean): ColumnEdge {
  return (side === "left") === panelsOnLeft ? "panels" : "opposite";
}

/** The side of the window an edge is on. */
export function sideOfEdge(edge: ColumnEdge, panelsOnLeft: boolean): "left" | "right" {
  return (edge === "panels") === panelsOnLeft ? "left" : "right";
}

/** The side of the window nearest to a column dropped at `box`: the one its middle is on. */
export function nearestSide(box: Box, window: Box): "left" | "right" {
  return box.left + box.width / 2 < window.left + window.width / 2 ? "left" : "right";
}

/** The place along an edge (`track`: where columns can go on it) of a column dropped at `box`. */
export function positionOnEdge(box: Box, track: Box): number {
  const free = track.height - box.height;
  if (free <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (box.top - track.top) / free));
}
