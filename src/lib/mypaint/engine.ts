// Didi's brush engine: libmypaint, compiled to WebAssembly.
//
// A stroke draws into libmypaint's own surface (64x64 tiles, 15-bit precision, so smudging
// keeps its quality during the stroke). Each tile is loaded from the layer the first time
// the brush needs it, and the tiles it writes are copied back into the layer's 8-bit tiles
// on `flush` (the conversions run in WebAssembly, see native/mypaint/didi-surface.c).
// `finish` returns the whole stroke as one undo step.

import type { Drawing } from "#lib/core/document/drawing.js";
import { replaceTiles, type Edit } from "#lib/core/history/edits.js";
import { TILE_SIZE, isTransparent, tileKey, type TileSnapshot } from "#lib/core/document/tiles.js";
import { keepAlpha } from "#lib/core/document/pixels.js";
import { intersect, union, type Rect } from "#lib/core/geometry.js";
import createLibMyPaint, { type LibMyPaint } from "./libmypaint.mjs";
import type { MybBrush } from "./myb";

/** Size of libmypaint's tiles, in pixels. */
const MP_TILE = 64;
/** Bytes in a libmypaint tile at 8 bits per channel. */
const MP_TILE_BYTES = MP_TILE * MP_TILE * 4;
const MAX_DIRTY = 4096;
/** Number of smudge buckets per brush, as in MyPaint. */
const SMUDGE_BUCKETS = 256;

/** Every input libmypaint 1.6 knows, to reset a setting's curves before loading a brush. */
const INPUTS = [
  "pressure",
  "speed1",
  "speed2",
  "random",
  "stroke",
  "direction",
  "tilt_declination",
  "tilt_ascension",
  "custom",
  "direction_angle",
  "attack_angle",
  "tilt_declinationx",
  "tilt_declinationy",
  "gridmap_x",
  "gridmap_y",
  "viewzoom",
  "barrel_rotation",
  "brush_radius",
];

let loading: Promise<MyPaint> | null = null;

/** Loads the engine (once). */
export function loadMyPaint(): Promise<MyPaint> {
  loading ??= createLibMyPaint().then((mod) => new MyPaint(mod));
  return loading;
}

export class MyPaint {
  readonly surface: number;
  private readonly dirtyBuffer: number;
  /** Receives a tile converted back to 8 bits. */
  private readonly copyBuffer: number;
  private readonly settingIds = new Map<string, number>();
  private readonly inputIds = new Map<string, number>();
  /** The stroke currently using the (single) surface. */
  current: MyPaintStroke | null = null;

  constructor(readonly mod: LibMyPaint) {
    this.surface = mod._didi_surface_new();
    this.dirtyBuffer = mod._malloc(MAX_DIRTY * 2 * 4);
    this.copyBuffer = mod._malloc(MP_TILE_BYTES);
    mod.loadTile = (tx, ty, buffer) => this.current?.loadTile(tx, ty, buffer);
  }

  createBrush(myb?: MybBrush): Brush {
    // Like MyPaint: recent brushes pick a smudge bucket with their "smudge_bucket" setting.
    const brush = new Brush(this, this.mod._mypaint_brush_new_with_buckets(SMUDGE_BUCKETS));
    if (myb) {
      brush.load(myb);
    } else {
      this.mod._mypaint_brush_from_defaults(brush.ptr);
    }
    return brush;
  }

  /** Setting id from its name, or -1 if libmypaint does not know it. */
  settingId(name: string): number {
    return this.lookup(this.settingIds, name, (p) => this.mod._mypaint_brush_setting_from_cname(p));
  }

  inputId(name: string): number {
    return this.lookup(this.inputIds, name, (p) => this.mod._mypaint_brush_input_from_cname(p));
  }

  /** Moves the written tiles' coordinates out of the surface. */
  takeDirty(): [number, number][] {
    const tiles: [number, number][] = [];
    for (;;) {
      const n = this.mod._didi_surface_take_dirty(this.surface, this.dirtyBuffer, MAX_DIRTY);
      const base = this.dirtyBuffer >> 2;
      for (let i = 0; i < n; i++) {
        tiles.push([this.mod.HEAP32[base + 2 * i], this.mod.HEAP32[base + 2 * i + 1]]);
      }
      if (n < MAX_DIRTY) {
        return tiles;
      }
    }
  }

  /**
   * A written tile's top-left `width` x `height` pixels, back in 8 bits and mixed with the
   * pixels before the stroke by `opacity`. Rows are 64 pixels long. Valid until the next
   * call into the engine. Null if the brush never used this tile.
   */
  copyBack(tx: number, ty: number, width: number, height: number, opacity: number) {
    const { mod } = this;
    const ok = mod._didi_surface_copy_back(
      this.surface,
      tx,
      ty,
      width,
      height,
      opacity,
      this.copyBuffer,
    );
    return ok ? mod.HEAPU8.subarray(this.copyBuffer, this.copyBuffer + MP_TILE_BYTES) : null;
  }

  private lookup(cache: Map<string, number>, name: string, find: (ptr: number) => number) {
    let id = cache.get(name);
    if (id === undefined) {
      const ptr = this.mod.stringToNewUTF8(name);
      id = find(ptr);
      this.mod._free(ptr);
      cache.set(name, id);
    }
    return id;
  }
}

export class Brush {
  constructor(
    private readonly mp: MyPaint,
    readonly ptr: number,
  ) {}

  /** Loads a .myb brush, the way MyPaint does. Unknown settings and inputs are ignored. */
  load(myb: MybBrush) {
    const { mod } = this.mp;
    mod._mypaint_brush_from_defaults(this.ptr);
    for (const [name, setting] of Object.entries(myb.settings)) {
      const id = this.mp.settingId(name);
      if (id < 0) {
        continue;
      }
      mod._mypaint_brush_set_base_value(this.ptr, id, setting.base_value);
      // The file lists all the curves of this setting: clear the others.
      for (const input of INPUTS) {
        const inputId = this.mp.inputId(input);
        if (inputId >= 0) {
          mod._mypaint_brush_set_mapping_n(this.ptr, id, inputId, 0);
        }
      }
      for (const [input, points] of Object.entries(setting.inputs)) {
        const inputId = this.mp.inputId(input);
        if (inputId < 0) {
          continue;
        }
        mod._mypaint_brush_set_mapping_n(this.ptr, id, inputId, points.length);
        points.forEach(([x, y], i) => {
          mod._mypaint_brush_set_mapping_point(this.ptr, id, inputId, i, x, y);
        });
      }
    }
  }

  set(name: string, value: number) {
    const id = this.mp.settingId(name);
    if (id < 0) {
      throw new Error(`Unknown brush setting ${name}`);
    }
    this.mp.mod._mypaint_brush_set_base_value(this.ptr, id, value);
  }

  get(name: string): number {
    const id = this.mp.settingId(name);
    if (id < 0) {
      throw new Error(`Unknown brush setting ${name}`);
    }
    return this.mp.mod._mypaint_brush_get_base_value(this.ptr, id);
  }

  /** Brush diameter in pixels (libmypaint stores the log of the radius). */
  set size(diameter: number) {
    this.set("radius_logarithmic", Math.log(Math.max(0.2, diameter) / 2));
  }

  get size(): number {
    return Math.exp(this.get("radius_logarithmic")) * 2;
  }

  /** Straight sRGB color, 0-255. */
  setColor([r, g, b]: readonly [number, number, number]) {
    const [h, s, v] = rgbToHsv(r / 255, g / 255, b / 255);
    this.set("color_h", h);
    this.set("color_s", s);
    this.set("color_v", v);
  }

  destroy() {
    this.mp.mod._mypaint_brush_unref(this.ptr);
  }
}

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

/** sRGB in [0, 1] → hue, saturation, value in [0, 1]. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;
    if (h < 0) {
      h += 1;
    }
  }
  return [h, max === 0 ? 0 : d / max, max];
}
