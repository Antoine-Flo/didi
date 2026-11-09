// The pixels a selection covers in a layer: read, cleared, cut down to what is drawn.

import type { ReadonlyLayer } from "#lib/core/document/layer.js";
import type { Rect } from "#lib/core/shared/geometry.js";
import { selectionOfMask, type SelectionState } from "#lib/core/selection/selection.js";
import { shapeMask, shapeOf, type SelectionShape } from "#lib/core/selection/shape.js";

/** Pixels taken from or put in a layer: premultiplied RGBA, row by row. */
export interface Image {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

/** The pixels of `rect` in a layer, those `shape` selects (all, without one) made transparent. */
export function clearedPixels(
  layer: ReadonlyLayer,
  rect: Rect,
  shape: SelectionShape | null | undefined,
): Uint8ClampedArray {
  const data = layer.tiles.readRegion(rect);
  if (shape) {
    const mask = shapeMask(rect, shape);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        data.fill(0, i * 4, i * 4 + 4);
      }
    }
  } else {
    data.fill(0);
  }
  return data;
}

/** The pixels of `rect` in a layer, those `shape` leaves out made transparent. */
export function selectedPixels(
  layer: ReadonlyLayer,
  rect: Rect,
  shape: SelectionShape | null | undefined,
): Uint8ClampedArray {
  const pixels = layer.tiles.readRegion(rect);
  if (shape) {
    const mask = shapeMask(rect, shape);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) {
        pixels.fill(0, i * 4, i * 4 + 4);
      }
    }
  }
  return pixels;
}

/** Which pixels are not transparent: 1 for those, 0 for the others. */
export function opaqueMask(pixels: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(pixels.length / 4);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = pixels[i * 4 + 3] > 0 ? 1 : 0;
  }
  return mask;
}

/**
 * The selection (or the whole canvas) cut down to the rectangle around what is drawn in it
 * on a layer, keeping its shape there. Null if nothing is.
 */
export function drawnArea(
  layer: ReadonlyLayer,
  state: SelectionState,
  canvas: Rect,
): SelectionState | null {
  const { rect: selected, shape } = state;
  const rect = selected ?? canvas;
  const pixels = layer.tiles.readRegion(rect);
  const inside = shape ? shapeMask(rect, shape) : null;
  const drawn = new Uint8Array(rect.width * rect.height);
  for (let i = 0; i < drawn.length; i++) {
    drawn[i] = (!inside || inside[i]) && pixels[i * 4 + 3] > 0 ? 1 : 0;
  }
  const around = selectionOfMask(rect, drawn).rect;
  if (!around) {
    return null;
  }
  // The selection's own shape in that rectangle, not the drawing's: what is transparent in
  // it is lifted too, harmlessly.
  if (!inside) {
    return { ...state, rect: around, floating: null };
  }
  const mask = new Uint8Array(around.width * around.height);
  for (let y = 0; y < around.height; y++) {
    const from = (around.y - rect.y + y) * rect.width + (around.x - rect.x);
    mask.set(inside.subarray(from, from + around.width), y * around.width);
  }
  return {
    ...state,
    rect: around,
    shape: shapeOf(mask, around.width, around.height),
  };
}

/** The pixels of `rect`, inside `from`, of an image covering `from`. */
export function cropped(image: Image, from: Rect, rect: Rect): Uint8ClampedArray {
  if (rect.width === from.width && rect.height === from.height) {
    return image.pixels;
  }
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y - from.y + y) * from.width + (rect.x - from.x)) * 4;
    out.set(image.pixels.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return out;
}
