// The handles of a selection, and what each part of it does under the pen.
//
// Inside the frame, the 4 bounds handles move one edge of the selection, without touching the
// pixels, and the cross moves the center of rotation. They only show on selections large
// enough on screen, which leaves room to grab the center, and come back by zooming in; the
// bounds handles also wait until content that was rotated or skewed is applied. Outside the
// frame, 8 handles scale what is selected. Around them, a band with nothing drawn rotates the
// content (near the corners) or skews it (along the sides): only the pointer tells. Anywhere
// else inside, the pen moves the content.
//
// Sizes are in screen pixels, so that the handles look the same at any zoom. The view draws
// the rectangles given here, and the hit test uses them: they cannot disagree.

import type { Rect } from "../geometry";
import {
  centerOf,
  contains,
  corners,
  mirrored,
  outward,
  toCanvas,
  type Placement,
  type Point,
} from "./placement";

export type Side = "n" | "e" | "s" | "w";
export type HandleId = Side | "ne" | "se" | "sw" | "nw";

export interface Handle {
  group: "bounds" | "content" | "pivot";
  id: HandleId;
  /** What is drawn, in canvas pixels. */
  shape: Rect;
  /** What the pen can grab, in canvas pixels. */
  grab: Rect;
}

export type SelectionZone =
  | { kind: "outside" }
  | { kind: "inside" }
  | { kind: "bounds"; side: Side }
  | { kind: "content"; id: HandleId }
  | { kind: "rotate"; id: HandleId }
  | { kind: "skew"; side: Side }
  | { kind: "pivot" };

/** Smallest side on screen that still has bounds handles. */
const BOUNDS_FROM = 64;
const BOUNDS_LENGTH = 18;
const BOUNDS_THICKNESS = 4;
const BOUNDS_INSET = 8;
/** Generous for a pen, without covering the center. */
const BOUNDS_GRAB_LENGTH = 28;
const BOUNDS_GRAB_THICKNESS = 14;
const CONTENT_SIZE = 9;
const CONTENT_GAP = 10;
const CONTENT_GRAB = 18;
/** How far the band for rotating and skewing goes around the frame. */
const BAND = 32;
/** How far along a side, from a corner, the band rotates rather than skews. */
const CORNER_REACH = 20;
const PIVOT_SIZE = 12;
const PIVOT_GRAB = 14;

const CONTENT_HANDLES: readonly [HandleId, number, number][] = [
  ["nw", 0, 0],
  ["n", 0.5, 0],
  ["ne", 1, 0],
  ["e", 1, 0.5],
  ["se", 1, 1],
  ["s", 0.5, 1],
  ["sw", 0, 1],
  ["w", 0, 0.5],
];

const centered = (x: number, y: number, width: number, height: number): Rect => ({
  x: x - width / 2,
  y: y - height / 2,
  width,
  height,
});

/** The handles of a selection, at a zoom. `pivot`: its center of rotation, if moved. */
export function selectionHandles(p: Placement, zoom: number, pivot: Point | null = null): Handle[] {
  const px = 1 / zoom;
  const handles: Handle[] = [];
  const large = Math.min(p.width, p.height) * zoom >= BOUNDS_FROM;

  if (large && !p.transform) {
    const midX = p.x + p.width / 2;
    const midY = p.y + p.height / 2;
    const right = p.x + p.width;
    const bottom = p.y + p.height;
    const inset = BOUNDS_INSET * px;
    const across = (id: Side, y: number) =>
      handles.push({
        group: "bounds",
        id,
        shape: centered(midX, y, BOUNDS_LENGTH * px, BOUNDS_THICKNESS * px),
        grab: centered(midX, y, BOUNDS_GRAB_LENGTH * px, BOUNDS_GRAB_THICKNESS * px),
      });
    const along = (id: Side, x: number) =>
      handles.push({
        group: "bounds",
        id,
        shape: centered(x, midY, BOUNDS_THICKNESS * px, BOUNDS_LENGTH * px),
        grab: centered(x, midY, BOUNDS_GRAB_THICKNESS * px, BOUNDS_GRAB_LENGTH * px),
      });
    across("n", p.y + inset);
    along("e", right - inset);
    across("s", bottom - inset);
    along("w", p.x + inset);
  }

  if (large || pivot) {
    const { x, y } = pivot ?? centerOf(p);
    handles.push({
      group: "pivot",
      id: "n",
      shape: centered(x, y, PIVOT_SIZE * px, PIVOT_SIZE * px),
      grab: centered(x, y, PIVOT_GRAB * px, PIVOT_GRAB * px),
    });
  }

  for (const [id, fx, fy] of CONTENT_HANDLES) {
    // At the same distance on each axis as without a transform.
    const reach = (id.length === 2 ? Math.SQRT2 : 1) * CONTENT_GAP * px;
    const point = toCanvas(p, p.x + fx * p.width, p.y + fy * p.height);
    const away = outward(p, fx * 2 - 1, fy * 2 - 1);
    const x = point.x + away.x * reach;
    const y = point.y + away.y * reach;
    handles.push({
      group: "content",
      id,
      shape: centered(x, y, CONTENT_SIZE * px, CONTENT_SIZE * px),
      grab: centered(x, y, CONTENT_GRAB * px, CONTENT_GRAB * px),
    });
  }
  return handles;
}

const inRect = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

const SIDES: readonly Side[] = ["n", "e", "s", "w"];
const CORNERS: readonly HandleId[] = ["nw", "ne", "se", "sw"];

/** The zone of the band around the frame at a point, if it is in the band. */
function bandZone(p: Placement, x: number, y: number, zoom: number): SelectionZone | null {
  const points = corners(p);
  let nearest = Infinity;
  let zone: SelectionZone | null = null;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const t = Math.min(1, Math.max(0, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy)));
    const distance = Math.hypot(a.x + vx * t - x, a.y + vy * t - y) * zoom;
    if (distance >= nearest) return;
    nearest = distance;
    const length = Math.hypot(vx, vy) * zoom;
    if (t * length <= CORNER_REACH) zone = { kind: "rotate", id: CORNERS[i] };
    else if ((1 - t) * length <= CORNER_REACH) {
      zone = { kind: "rotate", id: CORNERS[(i + 1) % CORNERS.length] };
    } else zone = { kind: "skew", side: SIDES[i] };
  });
  return nearest <= BAND ? zone : null;
}

/** What the pen would grab at a point, in canvas pixels. */
export function zoneAt(
  p: Placement,
  x: number,
  y: number,
  zoom: number,
  pivot: Point | null = null,
): SelectionZone {
  for (const { group, id, grab } of selectionHandles(p, zoom, pivot)) {
    if (!inRect(grab, x, y)) continue;
    switch (group) {
      case "bounds":
        return { kind: "bounds", side: id as Side };
      case "content":
        return { kind: "content", id };
      case "pivot":
        return { kind: "pivot" };
    }
  }
  if (contains(p, x, y)) return { kind: "inside" };
  return bandZone(p, x, y, zoom) ?? { kind: "outside" };
}

/** `rect` with one edge moved by `delta` pixels, inside `canvas`, at least 1 pixel wide. */
export function moveEdge(rect: Rect, side: Side, delta: number, canvas: Rect): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (side === "w") left = clamp(left + delta, canvas.x, right - 1);
  if (side === "e") right = clamp(right + delta, left + 1, canvas.x + canvas.width);
  if (side === "n") top = clamp(top + delta, canvas.y, bottom - 1);
  if (side === "s") bottom = clamp(bottom + delta, top + 1, canvas.y + canvas.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * A box scaled by moving a handle by (dx, dy) pixels, at least 1 pixel wide; the opposite side
 * or corner stays in place. `keepRatio` applies to the corners. When the handle goes past that
 * opposite side, the size starts growing again, and `mirrorX` or `mirrorY` tells where the
 * content has to be mirrored to show on that side: the line it went past.
 */
export function scaleRect(
  rect: Rect,
  id: HandleId,
  dx: number,
  dy: number,
  keepRatio = false,
): Rect & { mirrorX: number | null; mirrorY: number | null } {
  const west = id.includes("w");
  const east = id.includes("e");
  const north = id.includes("n");
  const south = id.includes("s");
  // Signed: negative once the handle has gone past the opposite side.
  let signedWidth = rect.width;
  let signedHeight = rect.height;
  if (west) signedWidth = rect.width - dx;
  if (east) signedWidth = rect.width + dx;
  if (north) signedHeight = rect.height - dy;
  if (south) signedHeight = rect.height + dy;
  let width = Math.max(1, Math.abs(signedWidth));
  let height = Math.max(1, Math.abs(signedHeight));
  if (keepRatio && id.length === 2) {
    const ratio = Math.max(width / rect.width, height / rect.height);
    width = Math.max(1, Math.round(rect.width * ratio));
    height = Math.max(1, Math.round(rect.height * ratio));
  }
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return {
    x: west ? right - width : rect.x,
    y: north ? bottom - height : rect.y,
    width,
    height,
    mirrorX: signedWidth < 0 ? (west ? right : rect.x) : null,
    mirrorY: signedHeight < 0 ? (north ? bottom : rect.y) : null,
  };
}

/** A placement scaled by moving a handle, along its own sides (see `scaleRect`). */
export function scaled(
  p: Placement,
  id: HandleId,
  dx: number,
  dy: number,
  keepRatio = false,
): Placement {
  const { mirrorX, mirrorY, ...box } = scaleRect(p, id, dx, dy, keepRatio);
  return mirrored({ ...box, transform: p.transform }, mirrorX, mirrorY);
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

const COMPASS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

/** The compass point of a direction on the canvas. */
function compass({ x, y }: Point): string {
  const turn = Math.round((Math.atan2(y, x) / (Math.PI * 2)) * 8);
  return COMPASS[(turn + 8) % 8];
}

const FRACTIONS: Record<HandleId, Point> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
  nw: { x: -1, y: -1 },
};

/** A curved arrow, with a white halo to show on dark colors. */
const ROTATE_ICON = "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6";
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke='white' stroke-width='4' d='${ROTATE_ICON}'/%3E%3Cpath stroke='black' stroke-width='2' d='${ROTATE_ICON}'/%3E%3C/svg%3E") 12 12, crosshair`;

/** The CSS pointer for a zone, following the rotation of the selection. */
export function zoneCursor(zone: SelectionZone, p: Placement): string | null {
  switch (zone.kind) {
    case "outside":
      return null;
    case "inside":
      return "move";
    case "pivot":
      return "grab";
    case "rotate":
      return ROTATE_CURSOR;
    case "bounds":
      return zone.side === "n" || zone.side === "s" ? "row-resize" : "col-resize";
    case "content": {
      const { x, y } = FRACTIONS[zone.id];
      return `${compass(outward(p, x, y))}-resize`;
    }
    case "skew": {
      // Along the side: the pen slides it.
      const { x, y } = FRACTIONS[zone.side];
      return `${compass(outward(p, y, x))}-resize`;
    }
  }
}
