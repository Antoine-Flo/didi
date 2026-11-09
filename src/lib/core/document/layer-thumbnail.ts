// A small preview of a layer, for the layers panel: its content, framed to fit.
//
// Each preview pixel averages a few samples of the area it covers, instead of every pixel:
// the cost depends on the preview's size, not the layer's, so it stays cheap on large
// canvases.

import type { Rect } from "../geometry";
import type { ReadonlyTileStore } from "./layer";
import { TILE_SIZE, tileCoord } from "./tiles";

/** Samples per preview pixel, on each axis. */
const SAMPLES = 3;

export interface Thumbnail {
  width: number;
  height: number;
  /** Straight RGBA. */
  data: Uint8ClampedArray;
}

/**
 * The smallest rectangle holding every visible pixel of the layer, or null if it is empty.
 * Only tiles that could widen the rectangle found so far are scanned.
 */
export function contentBounds(tiles: ReadonlyTileStore): Rect | null {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const key of tiles.keys()) {
    const { tx, ty } = tileCoord(key);
    const left = tx * TILE_SIZE;
    const top = ty * TILE_SIZE;
    const right = Math.min(left + TILE_SIZE, tiles.width);
    const bottom = Math.min(top + TILE_SIZE, tiles.height);
    if (left >= x0 && top >= y0 && right <= x1 && bottom <= y1) {
      continue;
    }
    const tile = tiles.getTile(tx, ty)!;
    for (let y = top; y < bottom; y++) {
      const row = (y - top) * TILE_SIZE;
      for (let x = left; x < right; x++) {
        if (tile[(row + x - left) * 4 + 3] === 0) {
          continue;
        }
        if (x < x0) {
          x0 = x;
        }
        if (x + 1 > x1) {
          x1 = x + 1;
        }
        if (y < y0) {
          y0 = y;
        }
        if (y + 1 > y1) {
          y1 = y + 1;
        }
      }
    }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * A preview of `area` of the layer (by default, the whole layer), at most `maxSize` pixels
 * wide or high, with its aspect ratio. Never larger than the area itself.
 */
export function layerThumbnail(
  tiles: ReadonlyTileStore,
  maxSize: number,
  area: Rect = { x: 0, y: 0, width: tiles.width, height: tiles.height },
): Thumbnail {
  const scale = Math.min(1, maxSize / Math.max(area.width, area.height));
  const width = Math.max(1, Math.round(area.width * scale));
  const height = Math.max(1, Math.round(area.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const stepX = area.width / width;
  const stepY = area.height / height;
  const maxX = area.x + area.width - 1;
  const maxY = area.y + area.height - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        const py = Math.min(maxY, area.y + Math.floor((y + (sy + 0.5) / SAMPLES) * stepY));
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = Math.min(maxX, area.x + Math.floor((x + (sx + 0.5) / SAMPLES) * stepX));
          const tile = tiles.getTile(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
          if (!tile) {
            continue;
          }
          const i = ((py % TILE_SIZE) * TILE_SIZE + (px % TILE_SIZE)) * 4;
          // Premultiplied: the color sums are already weighted by alpha.
          r += tile[i];
          g += tile[i + 1];
          b += tile[i + 2];
          a += tile[i + 3];
        }
      }
      if (a === 0) {
        continue;
      }
      const o = (y * width + x) * 4;
      data[o] = Math.round((r * 255) / a);
      data[o + 1] = Math.round((g * 255) / a);
      data[o + 2] = Math.round((b * 255) / a);
      data[o + 3] = Math.round(a / (SAMPLES * SAMPLES));
    }
  }
  return { width, height, data };
}
