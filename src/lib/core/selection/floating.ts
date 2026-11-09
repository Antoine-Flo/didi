// Floating content: lifted out of a layer, shown over it, sampled from its original pixels.

import type { Drawing } from "#lib/core/document/drawing.js";
import { tileKey, type TileSnapshot } from "#lib/core/document/tiles.js";
import { intersect, type Rect } from "#lib/core/shared/geometry.js";
import { boundsOf, toBox, type Placement } from "#lib/core/selection/placement.js";
import { layerTiles, type Floating } from "#lib/core/selection/selection.js";

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
