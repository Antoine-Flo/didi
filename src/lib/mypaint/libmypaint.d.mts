// Types of the libmypaint WebAssembly module (built by native/mypaint/build.sh).
// Pointers are byte offsets into the module's memory.

export interface LibMyPaint {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  /**
   * Called by the surface the first time it needs a tile: fill `pixels` (64x64 RGBA, 8-bit
   * premultiplied) with the layer's pixels before the stroke.
   */
  loadTile?: (tx: number, ty: number, pixels: number) => void;
  stringToNewUTF8(text: string): number;
  _malloc(bytes: number): number;
  _free(pointer: number): void;

  _didi_surface_new(): number;
  _didi_seed(seed: number): void;
  _didi_surface_destroy(surface: number): void;
  _didi_surface_clear(surface: number): void;
  _didi_surface_take_dirty(surface: number, out: number, max: number): number;
  /** Writes a dirty tile's pixels, 8-bit, into `out`; 0 if it was never requested. */
  _didi_surface_copy_back(
    surface: number,
    tx: number,
    ty: number,
    width: number,
    height: number,
    opacity: number,
    out: number,
  ): number;
  _didi_stroke_to(
    brush: number,
    surface: number,
    x: number,
    y: number,
    pressure: number,
    xtilt: number,
    ytilt: number,
    dtime: number,
    viewzoom: number,
    viewrotation: number,
  ): void;

  _mypaint_brush_new_with_buckets(buckets: number): number;
  _mypaint_brush_unref(brush: number): void;
  _mypaint_brush_from_defaults(brush: number): void;
  _mypaint_brush_reset(brush: number): void;
  _mypaint_brush_new_stroke(brush: number): void;
  _mypaint_brush_set_base_value(brush: number, setting: number, value: number): void;
  _mypaint_brush_get_base_value(brush: number, setting: number): number;
  _mypaint_brush_set_mapping_n(brush: number, setting: number, input: number, n: number): void;
  _mypaint_brush_set_mapping_point(
    brush: number,
    setting: number,
    input: number,
    index: number,
    x: number,
    y: number,
  ): void;
  _mypaint_brush_setting_from_cname(name: number): number;
  _mypaint_brush_input_from_cname(name: number): number;
}

export default function createLibMyPaint(options?: object): Promise<LibMyPaint>;
