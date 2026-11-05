// The selection: a rectangle of the canvas, and possibly content lifted from a layer.
//
// Lifted ("floating") content stays exact until it is applied: it is shown in its layer, on
// top of the layer as it was without it, always redrawn from the original pixels. So it can
// pass over other pixels without harming them, and be shrunk then enlarged without loss.
//
// A state is never changed, only replaced, and an undo step keeps the states and the tiles
// on both sides. Tiles are shared, not copied (see tiles.ts), which makes this cheap.

import type { Drawing } from "../document/drawing";
import { tileKey, type TileSnapshot } from "../document/tiles";
import { Emitter } from "../emitter";
import { intersect, type Rect } from "../geometry";
import { replaceTiles, type Edit } from "../history/edits";
import { boundsOf, toBox, toCanvas, type Placement, type Point, type Transform } from "./placement";
import { maskOutline, shapeFrom, shapeMask, type OutlineRun, type SelectionShape } from "./shape";

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
  /** The lasso's shape, inside the rectangle. None: the whole rectangle is selected. */
  readonly shape?: SelectionShape | null;
  readonly floating: Floating | null;
  /** The center of rotation, on the canvas, if moved. By default, the center of the box. */
  readonly pivot?: Point | null;
}

export const NO_SELECTION: SelectionState = { rect: null, floating: null };

/** Where a selection is: its rectangle, with its transform. */
export function placementOf({ rect, transform }: SelectionState): Placement | null {
  return rect && { ...rect, transform };
}

/**
 * The selection once floating content is laid where it is shown: the rectangle around it, in
 * the canvas. The pixels don't change.
 */
export function appliedState(drawing: Drawing, state: SelectionState): SelectionState {
  if (!state.floating) return state;
  const { width, height } = drawing;
  const placement = placementOf(state);
  const rect = placement && intersect(boundsOf(placement), { x: 0, y: 0, width, height });
  if (!placement || !rect || !state.shape) return { rect, floating: null };
  // The path as it is shown, for the new rectangle.
  const shown = state.shape.points.map((p) =>
    toCanvas(placement, placement.x + p.x * placement.width, placement.y + p.y * placement.height),
  );
  return { rect, shape: shapeFrom(shown, rect), floating: null };
}

/** What limits drawing: the rectangle, and which of its pixels are selected. */
export function selectionClip({ rect, shape }: SelectionState): {
  clip: Rect | null;
  clipMask: Uint8Array | null;
} {
  return { clip: rect, clipMask: rect && shape ? shapeMask(rect, shape) : null };
}

/** The outline of a lasso, in pixels of its rectangle. Null: the rectangle itself. */
export function selectionOutline({ rect, shape }: SelectionState): OutlineRun[] | null {
  if (!rect || !shape) return null;
  return maskOutline(shapeMask(rect, shape), rect.width, rect.height);
}

export class Selection {
  private current = NO_SELECTION;
  private path: readonly Point[] | null = null;
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

  /** The path of a lasso being drawn, on the canvas: not a selection yet. */
  get draft(): readonly Point[] | null {
    return this.path;
  }

  setDraft(path: readonly Point[] | null) {
    this.path = path;
    this.changes.emit();
  }

  /** Replaces the state, without touching any pixels or the history. */
  set(state: SelectionState) {
    if (state === this.current) return;
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
      if (mask[i]) continue;
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
 * Shows floating content in `to`, in place of where it was shown (`from`). Stretched to fit,
 * with exact pixels, and laid over what its layer has there.
 */
export function showFloating(drawing: Drawing, floating: Floating, from: Placement, to: Placement) {
  const { layerId, base } = floating;
  const { tiles } = drawing.getLayer(layerId);
  const shown: TileSnapshot = new Map();
  for (const { tx, ty } of tiles.tilesIn(boundsOf(from))) {
    const key = tileKey(tx, ty);
    shown.set(key, base.get(key));
  }
  drawing.restorePixels(layerId, shown);

  const area = intersect(boundsOf(to), tiles.bounds);
  if (!area) return;
  const data = tiles.readRegion(area);
  const { pixels, width, height } = floating;
  for (let y = 0; y < area.height; y++) {
    for (let x = 0; x < area.width; x++) {
      // The original pixel under the center of this one.
      const q = toBox(to, area.x + x + 0.5, area.y + y + 0.5);
      const sx = Math.floor(((q.x - to.x) * width) / to.width);
      const sy = Math.floor(((q.y - to.y) * height) / to.height);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const s = (sy * width + sx) * 4;
      const a = pixels[s + 3];
      if (a === 0) continue;
      const d = (y * area.width + x) * 4;
      const keep = (255 - a) / 255;
      for (let c = 0; c < 4; c++) data[d + c] = pixels[s + c] + Math.round(data[d + c] * keep);
    }
  }
  drawing.writePixels(layerId, area, data);
}
