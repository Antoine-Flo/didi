// One brush stroke on a layer, through libmypaint's surface (see engine.ts).

import type { Drawing } from "#lib/core/document/drawing.js";
import { replaceTiles, type Edit } from "#lib/core/history/edits.js";
import { TILE_SIZE, isTransparent, tileKey, type TileSnapshot } from "#lib/core/document/tiles.js";
import { keepAlpha } from "#lib/core/document/pixels.js";
import { intersect, union, type Rect } from "#lib/core/shared/geometry.js";
import type { Brush } from "#lib/mypaint/brush.js";
import { MP_TILE, MP_TILE_BYTES, type MyPaint } from "#lib/mypaint/engine.js";

/** The only pixels a stroke can change: those of `clip`, or those of it where `clipMask` is 1. */
export interface StrokeClip {
  clip: Rect | null;
  clipMask: Uint8Array | null;
}

/**
 * One stroke of a brush on a layer. Only one stroke can be in progress at a time.
 *
 * `opacity` (0 to 1) applies to the whole stroke: each pixel is mixed between its value
 * before the stroke and the brush's result. It works the same for every brush, whatever
 * its own opacity settings, and for erasers.
 *
 * `limit` applies when copying back to the layer: the brush still paints on its own surface
 * outside it, like on a stencil, but none of that reaches the layer.
 */
export class MyPaintStroke {
  private readonly original: TileSnapshot = new Map();
  private readonly working = new Map<number, Uint8ClampedArray>();
  /** The layer's alpha lock: pixels keep their opacity. */
  private readonly alphaLocked: boolean;
  private finished = false;

  constructor(
    private readonly mp: MyPaint,
    private readonly brush: Brush,
    private readonly drawing: Drawing,
    private readonly layerId: string,
    private readonly opacity = 1,
    private readonly limit: StrokeClip = { clip: null, clipMask: null },
  ) {
    const layer = drawing.getLayer(layerId);
    if (layer.locked) {
      throw new Error(`Layer ${layerId} is locked`);
    }
    this.alphaLocked = layer.alphaLocked;
    if (!(opacity >= 0 && opacity <= 1)) {
      throw new RangeError(`Invalid opacity ${opacity}`);
    }
    if (mp.current) {
      throw new Error("Another stroke is in progress");
    }
    mp.current = this;
    mp.mod._didi_surface_clear(mp.surface);
    // Smudge sampling uses rand(): same seed, same result for the same stroke.
    mp.mod._didi_seed(1);
    // Forget the previous stroke's position, so this one does not start with a line.
    mp.mod._mypaint_brush_reset(brush.ptr);
    mp.mod._mypaint_brush_new_stroke(brush.ptr);
  }

  /**
   * Places the brush at the start of the stroke, without painting. Call before the first
   * `strokeTo`: otherwise libmypaint's position smoothing (slow tracking) starts from where
   * the brush was before, and the stroke begins with a line from there. A long time gap
   * makes libmypaint treat this point as a fresh start, like MyPaint does.
   */
  moveTo(x: number, y: number, tiltX = 0, tiltY = 0) {
    this.assertActive();
    this.send(x, y, 0, tiltX, tiltY, 10);
  }

  /**
   * The view the stroke is drawn in: zoom, and rotation in degrees. libmypaint measures
   * the brush speed on screen, like MyPaint, so speed dynamics depend on the zoom.
   */
  view = { zoom: 1, rotation: 0 };

  /**
   * Moves the brush. Positions in canvas pixels, pressure 0-1, tilt in degrees,
   * `dtime` in seconds since the previous call.
   */
  strokeTo(x: number, y: number, pressure: number, tiltX = 0, tiltY = 0, dtime = 1 / 120) {
    this.assertActive();
    this.send(x, y, pressure, tiltX, tiltY, Math.max(0.001, dtime));
  }

  private send(
    x: number,
    y: number,
    pressure: number,
    tiltX: number,
    tiltY: number,
    dtime: number,
  ) {
    this.mp.mod._didi_stroke_to(
      this.brush.ptr,
      this.mp.surface,
      x,
      y,
      pressure,
      tiltX / 90,
      tiltY / 90,
      dtime,
      this.view.zoom,
      this.view.rotation,
    );
  }

  /**
   * Marks a single point, for a tap: libmypaint only places dabs along a movement, so a
   * stroke without movement would leave nothing. Briefly makes the brush place dabs over
   * time instead.
   */
  tap(x: number, y: number, pressure: number, tiltX = 0, tiltY = 0) {
    this.assertActive();
    const previous = this.brush.get("dabs_per_second");
    // About 6 dabs over 30 ms: as dense as a regular stroke of the same brush.
    this.brush.set("dabs_per_second", 200);
    try {
      // libmypaint takes two calls to bring the new rate into its state; the third one
      // places the dabs.
      this.strokeTo(x, y, pressure, tiltX, tiltY, 0.001);
      this.strokeTo(x, y, pressure, tiltX, tiltY, 0.001);
      this.strokeTo(x, y, pressure, tiltX, tiltY, 0.03);
    } finally {
      this.brush.set("dabs_per_second", previous);
    }
  }

  /**
   * Copies the tiles written since the last flush into the layer. Call once per frame.
   * Only the changed part of each layer tile is notified, so the view uploads just that.
   */
  flush() {
    if (this.finished) {
      return;
    }
    const changed = new Map<number, Uint8ClampedArray>();
    const areas = new Map<number, Rect>();
    for (const [tx, ty] of this.mp.takeDirty()) {
      const area = this.copyBack(tx, ty);
      if (!area) {
        continue;
      }
      changed.set(area.key, this.working.get(area.key)!);
      const previous = areas.get(area.key);
      areas.set(area.key, previous ? union(previous, area.rect) : area.rect);
    }
    if (changed.size > 0) {
      this.drawing.showStrokeTiles(this.layerId, changed, areas);
    }
  }

  /** Ends the stroke. Returns it as one undo step, or null if it changed nothing. */
  finish(label: string): Edit | null {
    this.assertActive();
    this.flush();
    this.release();
    if (this.original.size === 0) {
      return null;
    }
    // Tiles left fully transparent (erased) are not kept: the layer stays sparse.
    const empty: TileSnapshot = new Map();
    for (const [key, tile] of this.working) {
      if (isTransparent(tile)) {
        empty.set(key, undefined);
      }
    }
    if (empty.size > 0) {
      this.drawing.restorePixels(this.layerId, empty);
    }
    const after = this.drawing.getLayer(this.layerId).tiles.snapshot(this.original.keys());
    return replaceTiles(this.layerId, this.original, after, label);
  }

  /** Abandons the stroke and puts the layer back as it was. */
  cancel() {
    this.assertActive();
    this.release();
    this.drawing.restorePixels(this.layerId, this.original);
  }

  /** Fills a libmypaint tile (8 bits) from the layer, as it was before the stroke. */
  loadTile(tx: number, ty: number, pixels: number) {
    const out = this.mp.mod.HEAPU8.subarray(pixels, pixels + MP_TILE_BYTES);
    const { width, height } = this.drawing;
    const x0 = tx * MP_TILE;
    const y0 = ty * MP_TILE;
    // Layer tiles are a multiple of libmypaint's: this tile lies in a single layer tile.
    const outside = x0 < 0 || y0 < 0 || x0 >= width || y0 >= height;
    const src = outside ? undefined : this.sourceTile(x0, y0);
    const w = Math.min(MP_TILE, width - x0);
    const h = Math.min(MP_TILE, height - y0);
    if (!src || w < MP_TILE || h < MP_TILE) {
      out.fill(0);
    }
    if (!src) {
      return;
    }
    for (let y = 0; y < h; y++) {
      const i = (((y0 % TILE_SIZE) + y) * TILE_SIZE + (x0 % TILE_SIZE)) * 4;
      const o = y * MP_TILE * 4;
      out.set(src.subarray(i, i + w * 4), o);
    }
  }

  /** The layer tile containing a pixel, as it was before the stroke. */
  private sourceTile(px: number, py: number): Uint8ClampedArray | undefined {
    const key = tileKey(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
    if (this.original.has(key)) {
      return this.original.get(key);
    }
    return this.drawing.getLayer(this.layerId).tiles.snapshot([key]).get(key);
  }

  /**
   * Copies a libmypaint tile into the layer's working tile. Returns the layer tile key and
   * the area written in it (in tile pixels).
   */
  private copyBack(tx: number, ty: number): { key: number; rect: Rect } | null {
    const x0 = tx * MP_TILE;
    const y0 = ty * MP_TILE;
    const { width, height } = this.drawing;
    if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
      return null;
    }
    const w = Math.min(MP_TILE, width - x0);
    const h = Math.min(MP_TILE, height - y0);
    const tile = { x: x0, y: y0, width: w, height: h };
    const { clip, clipMask } = this.limit;
    const area = clip ? intersect(tile, clip) : tile;
    if (!area) {
      return null;
    }
    const src = this.mp.copyBack(tx, ty, w, h, this.opacity);
    if (!src) {
      return null;
    }

    const ltx = Math.floor(x0 / TILE_SIZE);
    const lty = Math.floor(y0 / TILE_SIZE);
    const key = tileKey(ltx, lty);
    let out = this.working.get(key);
    if (!out) {
      const before = this.drawing.getLayer(this.layerId).tiles.snapshot([key]).get(key);
      this.original.set(key, before);
      out = before ? before.slice() : new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
      this.working.set(key, out);
    }
    const originX = ltx * TILE_SIZE;
    const originY = lty * TILE_SIZE;
    for (let y = area.y; y < area.y + area.height; y++) {
      const s = ((y - y0) * MP_TILE + (area.x - x0)) * 4;
      const o = ((y - originY) * TILE_SIZE + (area.x - originX)) * 4;
      if (!clip || !clipMask) {
        out.set(src.subarray(s, s + area.width * 4), o);
        continue;
      }
      const row = (y - clip.y) * clip.width + (area.x - clip.x);
      for (let i = 0; i < area.width; i++) {
        if (!clipMask[row + i]) {
          continue;
        }
        out.set(src.subarray(s + i * 4, s + i * 4 + 4), o + i * 4);
      }
    }
    if (this.alphaLocked) {
      // Pixels left out by the clip mask are as before: this leaves them unchanged.
      const before = this.original.get(key);
      for (let y = area.y; y < area.y + area.height; y++) {
        const o = ((y - originY) * TILE_SIZE + (area.x - originX)) * 4;
        for (let i = 0; i < area.width * 4; i += 4) {
          keepAlpha(out, o + i, before);
        }
      }
    }
    return { key, rect: { ...area, x: area.x - originX, y: area.y - originY } };
  }

  private assertActive() {
    if (this.finished) {
      throw new Error("The stroke is finished");
    }
  }

  private release() {
    this.finished = true;
    this.mp.current = null;
  }
}
