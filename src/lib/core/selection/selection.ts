// The selection: a rectangle of the canvas, and possibly content lifted from a layer.
//
// Lifted ("floating") content stays exact until it is applied: it is shown in its layer, on
// top of the layer as it was without it, always redrawn from the original pixels. So it can
// pass over other pixels without harming them, and be shrunk then enlarged without loss.
//
// A state is never changed, only replaced, and an undo step keeps the states and the tiles
// on both sides. Tiles are shared, not copied (see tiles.ts), which makes this cheap.

import type { Drawing } from "#lib/core/document/drawing.js";
import { tileKey, type TileSnapshot } from "#lib/core/document/tiles.js";
import { Emitter } from "#lib/core/shared/emitter.js";
import { intersect, type Rect } from "#lib/core/shared/geometry.js";
import { replaceTiles, type Edit } from "#lib/core/history/edits.js";
import {
  boundsOf,
  toBox,
  type Placement,
  type Point,
  type Transform,
} from "#lib/core/selection/placement.js";
import {
  maskOutline,
  shapeMask,
  shapeOf,
  type OutlineRun,
  type SelectionShape,
} from "#lib/core/selection/shape.js";

/** Content lifted from a layer. */
export interface Floating {
  readonly layerId: string;
  /** The original pixels, premultiplied. */
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Where they come from. */
  readonly origin: Rect;
  /** Every tile of the layer before lifting, and without the content. */
  readonly original: TileSnapshot;
  readonly base: TileSnapshot;
}

export interface SelectionState {
  /** Inside the canvas, unless content is floating: it may hang over the edges. */
  readonly rect: Rect | null;
  /** Floating content only: its rotation and skew, the rectangle being its box. */
  readonly transform?: Transform | null;
  /** Which pixels of the rectangle are selected (a lasso, an inversion). None: all of them. */
  readonly shape?: SelectionShape | null;
  readonly floating: Floating | null;
  /** The center of rotation, on the canvas, if moved. By default, the center of the box. */
  readonly pivot?: Point | null;
}

/** What a selection being made would select. */
export interface SelectionArea {
  readonly rect: Rect;
  readonly shape?: SelectionShape | null;
}

export const NO_SELECTION: SelectionState = { rect: null, floating: null };

/** Where a selection is: its rectangle, with its transform. */
export function placementOf({ rect, transform }: SelectionState): Placement | null {
  return rect && { ...rect, transform };
}

/**
 * The selection once floating content is laid where it is shown: the rectangle around it, in
 * the canvas, and the pixels it covers there (turned, it is no longer a rectangle). The pixels
 * of the layer don't change.
 */
export function appliedState(drawing: Drawing, state: SelectionState): SelectionState {
  if (!state.floating) {
    return state;
  }
  const { width, height } = drawing;
  const placement = placementOf(state);
  const rect = placement && intersect(boundsOf(placement), { x: 0, y: 0, width, height });
  if (!placement || !rect) {
    return NO_SELECTION;
  }
  if (!state.shape && !placement.transform) {
    return { rect, floating: null };
  }
  // Each pixel of the new rectangle takes the selected pixel shown at its center, if any.
  const box = { x: placement.x, y: placement.y, width: placement.width, height: placement.height };
  const inBox = state.shape ? shapeMask(box, state.shape) : null;
  const mask = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const q = toBox(placement, rect.x + x + 0.5, rect.y + y + 0.5);
      const bx = Math.floor(q.x - box.x);
      const by = Math.floor(q.y - box.y);
      if (bx < 0 || by < 0 || bx >= box.width || by >= box.height) {
        continue;
      }
      if (!inBox || inBox[by * box.width + bx]) {
        mask[y * rect.width + x] = 1;
      }
    }
  }
  return selectionOfMask(rect, mask);
}

/** The selection of a mask of `rect`, cut down to the pixels selected: none if none is. */
export function selectionOfMask(rect: Rect, mask: Uint8Array): SelectionState {
  let left = rect.width;
  let right = -1;
  let top = rect.height;
  let bottom = -1;
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      if (!mask[y * rect.width + x]) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) {
    return NO_SELECTION;
  }
  const width = right - left + 1;
  const height = bottom - top + 1;
  let cut = mask;
  if (width !== rect.width || height !== rect.height) {
    cut = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const from = (top + y) * rect.width + left;
      cut.set(mask.subarray(from, from + width), y * width);
    }
  }
  return {
    rect: { x: rect.x + left, y: rect.y + top, width, height },
    shape: shapeOf(cut, width, height),
    floating: null,
  };
}

/** The whole canvas. */
export function allSelected(drawing: Drawing): SelectionState {
  return { rect: { x: 0, y: 0, width: drawing.width, height: drawing.height }, floating: null };
}

/**
 * Every pixel of the canvas the selection leaves out, floating content laid first. Nothing
 * selected: the whole canvas.
 */
export function invertedState(drawing: Drawing, state: SelectionState): SelectionState {
  const canvas = allSelected(drawing);
  const { rect, shape } = appliedState(drawing, state);
  if (!rect) {
    return canvas;
  }
  const { width } = drawing;
  const mask = new Uint8Array(width * drawing.height).fill(1);
  const inRect = shape ? shapeMask(rect, shape) : null;
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      if (!inRect || inRect[y * rect.width + x]) {
        mask[(rect.y + y) * width + rect.x + x] = 0;
      }
    }
  }
  return selectionOfMask(canvas.rect!, mask);
}

/** What limits drawing: the rectangle, and which of its pixels are selected. */
export function selectionClip({ rect, shape }: SelectionState): {
  clip: Rect | null;
  clipMask: Uint8Array | null;
} {
  return { clip: rect, clipMask: rect && shape ? shapeMask(rect, shape) : null };
}

const outlines = new WeakMap<Uint8Array, OutlineRun[]>();

/**
 * The outline of a lasso, in pixels of its rectangle. Null: the rectangle itself. Kept until the
 * mask changes: it stays the same when the content moves or turns.
 */
export function selectionOutline({ rect, shape }: SelectionState): OutlineRun[] | null {
  if (!rect || !shape) {
    return null;
  }
  const mask = shapeMask(rect, shape);
  let outline = outlines.get(mask);
  if (!outline) {
    outlines.set(mask, (outline = maskOutline(mask, rect.width, rect.height)));
  }
  return outline;
}

export class Selection {
  private current = NO_SELECTION;
  private drafted: SelectionArea | null = null;
  private changes = new Emitter<void>();

  get state(): SelectionState {
    return this.current;
  }

  get rect(): Rect | null {
    return this.current.rect;
  }

  get floating(): Floating | null {
    return this.current.floating;
  }

  /** What the selection being made would select: not a selection yet. */
  get draft(): SelectionArea | null {
    return this.drafted;
  }

  setDraft(area: SelectionArea | null) {
    this.drafted = area;
    this.changes.emit();
  }

  /** Replaces the state, without touching any pixels or the history. */
  set(state: SelectionState) {
    if (state === this.current) {
      return;
    }
    this.current = state;
    this.changes.emit();
  }

  /** Calls `listener` after every change. Returns a function that unsubscribes. */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }
}

export interface PixelChange {
  layerId: string;
  before: TileSnapshot;
  after: TileSnapshot;
}

/** An undo step from one state to another, with the pixels that changed along with it. */
export function selectionEdit(
  selection: Selection,
  label: string,
  before: SelectionState,
  after: SelectionState,
  pixels?: PixelChange,
): Edit {
  const tiles = pixels && replaceTiles(pixels.layerId, pixels.before, pixels.after, label);
  return {
    label,
    apply(d) {
      tiles?.apply(d);
      selection.set(after);
    },
    revert(d) {
      tiles?.revert(d);
      selection.set(before);
    },
    bytes: () => (tiles?.bytes?.() ?? 0) + (after.floating?.pixels.length ?? 0),
  };
}

/** Every tile of a layer, as it is now. Cheap: tiles are shared. */
export function layerTiles(drawing: Drawing, layerId: string): TileSnapshot {
  const { tiles } = drawing.getLayer(layerId);
  return tiles.snapshot(tiles.tilesIn(tiles.bounds).map(({ tx, ty }) => tileKey(tx, ty)));
}

/** Keeps only the tiles that differ, on both sides. */
export function changedTiles(
  layerId: string,
  before: TileSnapshot,
  after: TileSnapshot,
): PixelChange {
  const keys = [...before.keys()].filter((key) => before.get(key) !== after.get(key));
  const pick = (from: TileSnapshot): TileSnapshot => new Map(keys.map((k) => [k, from.get(k)]));
  return { layerId, before: pick(before), after: pick(after) };
}
