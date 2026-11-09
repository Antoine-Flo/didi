// Didi's brush engine: libmypaint, compiled to WebAssembly.
//
// A stroke draws into libmypaint's own surface (64x64 tiles, 15-bit precision, so smudging
// keeps its quality during the stroke). Each tile is loaded from the layer the first time
// the brush needs it, and the tiles it writes are copied back into the layer's 8-bit tiles
// on `flush` (the conversions run in WebAssembly, see native/mypaint/didi-surface.c).
// `finish` returns the whole stroke as one undo step (see stroke.ts).

import createLibMyPaint, { type LibMyPaint } from "#lib/mypaint/wasm/libmypaint.mjs";
import { Brush } from "#lib/mypaint/brush.js";
import type { MybBrush } from "#lib/mypaint/myb.js";
import type { MyPaintStroke } from "#lib/mypaint/stroke.js";

/** Size of libmypaint's tiles, in pixels. */
export const MP_TILE = 64;
/** Bytes in a libmypaint tile at 8 bits per channel. */
export const MP_TILE_BYTES = MP_TILE * MP_TILE * 4;
const MAX_DIRTY = 4096;
/** Number of smudge buckets per brush, as in MyPaint. */
const SMUDGE_BUCKETS = 256;

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
