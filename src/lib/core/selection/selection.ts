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
import { Emitter } from "#lib/core/emitter.js";
import { intersect, type Rect } from "#lib/core/geometry.js";
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

/** Takes the pixels of `rect` (inside the canvas), or those of `mask` in it, out of a layer. */
export function lift(
  drawing: Drawing,
  layerId: string,
  rect: Rect,
  mask: Uint8Array | null = null,
): Floating {
  const original = layerTiles(drawing, layerId);
  const pixels = drawing.getLayer(layerId).tiles.readRegion(rect);
  // What stays in the layer: nothing, or what the mask leaves out.
  const left = new Uint8ClampedArray(pixels.length);
  if (mask) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        continue;
      }
      left.set(pixels.subarray(i * 4, i * 4 + 4), i * 4);
      pixels.fill(0, i * 4, i * 4 + 4);
    }
  }
  drawing.writePixels(layerId, rect, left);
  return {
    layerId,
    pixels,
    width: rect.width,
    height: rect.height,
    origin: rect,
    original,
    base: layerTiles(drawing, layerId),
  };
}

/**
 * Shows floating content in `to`, in place of where it was shown (`from`), stretched to fit and
 * laid over what its layer has there. By default its pixels stay exact, each taken whole from
 * the original under it. `smooth` mixes the four originals around it instead, for what must not
 * look jagged: moved by whole pixels, the content still doesn't change at all.
 */
export function showFloating(
  drawing: Drawing,
  floating: Floating,
  from: Placement,
  to: Placement,
  smooth = false,
) {
  const { layerId, base } = floating;
  const { tiles } = drawing.getLayer(layerId);
  const shown: TileSnapshot = new Map();
  for (const { tx, ty } of tiles.tilesIn(boundsOf(from))) {
    const key = tileKey(tx, ty);
    shown.set(key, base.get(key));
  }
  drawing.restorePixels(layerId, shown);

  const area = intersect(boundsOf(to), tiles.bounds);
  if (!area) {
    return;
  }
  const data = tiles.readRegion(area);
  layOver(data, area, floating, to, smooth);
  drawing.writePixels(layerId, area, data);
}

/**
 * Floating content as it is shown, alone: its pixels over the rectangle around it, which may
 * hang over the canvas's edges. Premultiplied.
 */
export function floatingImage(
  floating: Floating,
  to: Placement,
): { rect: Rect; pixels: Uint8ClampedArray } {
  const rect = boundsOf(to);
  const pixels = new Uint8ClampedArray(rect.width * rect.height * 4);
  layOver(pixels, rect, floating, to, false);
  return { rect, pixels };
}

/** Lays floating content shown at `to` over `data`, the pixels of `area`. */
function layOver(
  data: Uint8ClampedArray,
  area: Rect,
  floating: Floating,
  to: Placement,
  smooth: boolean,
) {
  const { pixels, width, height } = floating;
  if (!to.transform && to.width === width && to.height === height) {
    layOverMoved(data, area, floating, to);
    return;
  }
  const sample = smooth ? sampleSmooth : sampleExact;
  // From the box to the canvas is affine: a step on the canvas is the same step everywhere.
  const start = toBox(to, area.x + 0.5, area.y + 0.5);
  const right = toBox(to, area.x + 1.5, area.y + 0.5);
  const down = toBox(to, area.x + 0.5, area.y + 1.5);
  const color = new Float64Array(4);
  for (let y = 0; y < area.height; y++) {
    for (let x = 0; x < area.width; x++) {
      const qx = start.x + x * (right.x - start.x) + y * (down.x - start.x);
      const qy = start.y + x * (right.y - start.y) + y * (down.y - start.y);
      const sx = ((qx - to.x) * width) / to.width;
      const sy = ((qy - to.y) * height) / to.height;
      if (!sample(pixels, width, height, sx, sy, color)) {
        continue;
      }
      const d = (y * area.width + x) * 4;
      const keep = (255 - color[3]) / 255;
      for (let c = 0; c < 4; c++) {
        data[d + c] = color[c] + data[d + c] * keep;
      }
    }
  }
}

/** Content only moved, by whole pixels: every pixel stays exact, whatever the sampling. */
function layOverMoved(data: Uint8ClampedArray, area: Rect, floating: Floating, to: Rect) {
  const { pixels, width } = floating;
  for (let y = 0; y < area.height; y++) {
    let s = ((area.y + y - to.y) * width + (area.x - to.x)) * 4;
    let d = y * area.width * 4;
    for (let x = 0; x < area.width; x++, s += 4, d += 4) {
      const alpha = pixels[s + 3];
      if (alpha === 0) {
        continue;
      }
      const keep = (255 - alpha) / 255;
      for (let c = 0; c < 4; c++) {
        data[d + c] = pixels[s + c] + data[d + c] * keep;
      }
    }
  }
}

type Sampler = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Float64Array,
) => boolean;

/** The original pixel at a point of the content. False: nothing there. */
const sampleExact: Sampler = (pixels, width, height, x, y, color) => {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
    return false;
  }
  const s = (sy * width + sx) * 4;
  if (pixels[s + 3] === 0) {
    return false;
  }
  for (let c = 0; c < 4; c++) {
    color[c] = pixels[s + c];
  }
  return true;
};

/** The four original pixels around a point of the content, mixed. Beyond them: transparent. */
const sampleSmooth: Sampler = (pixels, width, height, x, y, color) => {
  const u = x - 0.5;
  const v = y - 0.5;
  const left = Math.floor(u);
  const top = Math.floor(v);
  if (left < -1 || top < -1 || left >= width || top >= height) {
    return false;
  }
  const fx = u - left;
  const fy = v - top;
  color.fill(0);
  for (let j = 0; j < 2; j++) {
    const row = top + j;
    if (row < 0 || row >= height) {
      continue;
    }
    for (let i = 0; i < 2; i++) {
      const col = left + i;
      if (col < 0 || col >= width) {
        continue;
      }
      const weight = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      if (weight === 0) {
        continue;
      }
      const s = (row * width + col) * 4;
      for (let c = 0; c < 4; c++) {
        color[c] += pixels[s + c] * weight;
      }
    }
  }
  return color[3] > 0;
};
