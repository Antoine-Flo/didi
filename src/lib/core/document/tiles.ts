// Pixel storage of a layer, split into square tiles.
//
// - Pixels are RGBA, 8 bits per channel, premultiplied alpha, row-major. No color channel
//   exceeds alpha; in particular a pixel with alpha 0 is all zeros.
// - Fully transparent tiles are not stored, so sparse layers stay light.
// - A stored tile is never mutated: writes replace it with a new array. Snapshots can
//   therefore keep references to tiles instead of copying them.

import { intersect, isIntegerRect, type Rect } from "#lib/core/shared/geometry.js";

export const TILE_SIZE = 256;
const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;

/** Pixel data of one tile, TILE_SIZE × TILE_SIZE. */
export type TileData = Uint8ClampedArray;

/** Saved tiles by key. `undefined` means the tile was empty. */
export type TileSnapshot = Map<number, TileData | undefined>;

export interface TileCoord {
  tx: number;
  ty: number;
}

// Tile columns are limited to 65 536, i.e. canvases up to 16 million pixels wide.
export const tileKey = (tx: number, ty: number) => ty * 65536 + tx;
export const tileCoord = (key: number): TileCoord => ({
  tx: key % 65536,
  ty: Math.floor(key / 65536),
});

export function isTransparent(data: TileData): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      return false;
    }
  }
  return true;
}

function sized(width: number, height: number) {
  assertCanvasSize(width, height);
  return { width, height, cols: Math.ceil(width / TILE_SIZE), rows: Math.ceil(height / TILE_SIZE) };
}

export function assertCanvasSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid size ${width} × ${height}`);
  }
}

export class TileStore {
  private size: { width: number; height: number; cols: number; rows: number };
  private tiles = new Map<number, TileData>();

  constructor(width: number, height: number) {
    this.size = sized(width, height);
  }

  get width(): number {
    return this.size.width;
  }

  get height(): number {
    return this.size.height;
  }

  get cols(): number {
    return this.size.cols;
  }

  get rows(): number {
    return this.size.rows;
  }

  /**
   * Changes the size and replaces every tile (the canvas was cropped, scaled, turned…).
   * Returns the size and the tiles as they were, to undo it the same way.
   */
  reset(
    width: number,
    height: number,
    tiles: ReadonlyMap<number, TileData | undefined>,
  ): { width: number; height: number; tiles: TileSnapshot } {
    const before = { width: this.width, height: this.height, tiles: new Map(this.tiles) };
    this.size = sized(width, height);
    this.tiles = new Map();
    for (const [key, tile] of tiles) {
      if (tile) {
        this.tiles.set(key, tile);
      }
    }
    return before;
  }

  get bounds(): Rect {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  /** Number of non-empty tiles. */
  get tileCount(): number {
    return this.tiles.size;
  }

  get memoryBytes(): number {
    return this.tiles.size * TILE_BYTES;
  }

  /** Returns the tile, or undefined if it is empty. Must not be mutated. */
  getTile(tx: number, ty: number): TileData | undefined {
    return this.tiles.get(tileKey(tx, ty));
  }

  /** Keys of all non-empty tiles. */
  keys(): IterableIterator<number> {
    return this.tiles.keys();
  }

  /** Coordinates of the tiles overlapping the rectangle, inside the canvas. */
  tilesIn(rect: Rect): TileCoord[] {
    const area = intersect(rect, this.bounds);
    if (!area) {
      return [];
    }
    const coords: TileCoord[] = [];
    const tx1 = Math.floor((area.x + area.width - 1) / TILE_SIZE);
    const ty1 = Math.floor((area.y + area.height - 1) / TILE_SIZE);
    for (let ty = Math.floor(area.y / TILE_SIZE); ty <= ty1; ty++) {
      for (let tx = Math.floor(area.x / TILE_SIZE); tx <= tx1; tx++) {
        coords.push({ tx, ty });
      }
    }
    return coords;
  }

  /** Copies the pixels of a region. Pixels outside the canvas are transparent. */
  readRegion(rect: Rect): Uint8ClampedArray {
    assertRect(rect);
    const out = new Uint8ClampedArray(rect.width * rect.height * 4);
    for (const { tx, ty } of this.tilesIn(rect)) {
      const tile = this.getTile(tx, ty);
      if (!tile) {
        continue;
      }
      copyRows(tile, tileRect(tx, ty), out, rect);
    }
    return out;
  }

  /**
   * Writes the pixels of a region. Pixels outside the canvas are ignored.
   * Returns the keys of the tiles that were touched.
   */
  writeRegion(rect: Rect, data: Uint8ClampedArray): number[] {
    assertRect(rect);
    if (data.length !== rect.width * rect.height * 4) {
      throw new RangeError(`Expected ${rect.width * rect.height * 4} bytes, got ${data.length}`);
    }
    const touched: number[] = [];
    for (const { tx, ty } of this.tilesIn(rect)) {
      const key = tileKey(tx, ty);
      const previous = this.tiles.get(key);
      const tile = previous ? previous.slice() : new Uint8ClampedArray(TILE_BYTES);
      copyRows(data, rect, tile, tileRect(tx, ty), this.bounds);
      this.put(key, tile);
      touched.push(key);
    }
    return touched;
  }

  /** Saves the given tiles. Cheap: tiles are shared, not copied. */
  snapshot(keys: Iterable<number>): TileSnapshot {
    const saved: TileSnapshot = new Map();
    for (const key of keys) {
      saved.set(key, this.tiles.get(key));
    }
    return saved;
  }

  /** Puts back tiles saved by `snapshot`. Returns the restored keys. */
  restore(snapshot: TileSnapshot): number[] {
    for (const [key, tile] of snapshot) {
      this.put(key, tile);
    }
    return [...snapshot.keys()];
  }

  /**
   * Stores tiles as they are, without checking for fully transparent ones (which costs a
   * scan of each tile). For a stroke in progress, which drops its empty tiles when it ends.
   * Returns the keys.
   */
  putUnchecked(tiles: Map<number, TileData>): number[] {
    for (const [key, tile] of tiles) {
      this.tiles.set(key, tile);
    }
    return [...tiles.keys()];
  }

  private put(key: number, tile: TileData | undefined) {
    if (!tile || isTransparent(tile)) {
      this.tiles.delete(key);
    } else {
      this.tiles.set(key, tile);
    }
  }
}

function assertRect(rect: Rect) {
  if (!isIntegerRect(rect)) {
    throw new RangeError(`Invalid rect ${JSON.stringify(rect)}`);
  }
}

function tileRect(tx: number, ty: number): Rect {
  return { x: tx * TILE_SIZE, y: ty * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE };
}

/** Copies the overlapping pixels from a source buffer to a destination buffer, within `clip`. */
function copyRows(
  src: Uint8ClampedArray,
  srcRect: Rect,
  dst: Uint8ClampedArray,
  dstRect: Rect,
  clip: Rect = dstRect,
) {
  const overlap = intersect(srcRect, dstRect);
  const area = overlap && intersect(overlap, clip);
  if (!area) {
    return;
  }
  const rowBytes = area.width * 4;
  for (let y = area.y; y < area.y + area.height; y++) {
    const from = ((y - srcRect.y) * srcRect.width + (area.x - srcRect.x)) * 4;
    const to = ((y - dstRect.y) * dstRect.width + (area.x - dstRect.x)) * 4;
    dst.set(src.subarray(from, from + rowBytes), to);
  }
}
