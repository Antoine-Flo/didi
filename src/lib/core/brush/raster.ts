// Paints a pixel-art stroke into the tiles of a layer, on the CPU (brushes use libmypaint,
// see $lib/mypaint).
//
// During a stroke, covered pixels are recorded in a coverage mask. Each touched pixel is
// recomputed from its value before the stroke and its coverage, so the stroke opacity is a
// ceiling: going over the same place within one stroke does not darken it, and a pixel
// removed by pixel-perfect gets back its exact original value.
//
// The stroke owns copies of the touched tiles and changes them in place; `flush` shows
// them in the drawing, `finish` returns the whole stroke as one undo step.

import type { Drawing } from "../document/drawing";
import { replaceTiles, type Edit } from "../history/edits";
import { intersect, type Rect } from "../geometry";
import { keepAlpha } from "../document/pixels";
import { TILE_SIZE, tileKey, type TileSnapshot } from "../document/tiles";
import type { Pixel } from "./pixel-path";

export interface StrokeStyle {
  /** Straight (not premultiplied) RGB, 0-255. */
  color: readonly [number, number, number];
  /** Maximum opacity of the stroke, 0 to 1. */
  opacity: number;
  mode: "paint" | "erase";
  /** Pixels outside this rectangle stay as they are. */
  clip?: Rect | null;
  /** Which pixels of `clip` can change, 1 for yes, row by row. By default, all of them. */
  clipMask?: Uint8Array | null;
}

const TILE_PIXELS = TILE_SIZE * TILE_SIZE;

/** The tip of a pixel-art brush. */
export type StampShape = "round" | "square";

/**
 * Pixel offsets of a pixel-art brush of the given diameter (or side), centered on (0, 0).
 */
export function pixelStamp(size: number, shape: StampShape = "round"): Pixel[] {
  const n = Math.max(1, Math.round(size));
  const offsets: Pixel[] = [];
  const r = n / 2;
  const shift = Math.floor(n / 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      // A small tolerance keeps the shape full on its axes for small sizes.
      const inside = shape === "square" || n <= 2 || dx * dx + dy * dy <= r * r + 0.25;
      if (inside) offsets.push({ x: x - shift, y: y - shift });
    }
  }
  return offsets;
}

export class StrokeRaster {
  private readonly original: TileSnapshot = new Map();
  private readonly working = new Map<number, Uint8ClampedArray>();
  private readonly coverage = new Map<number, Float32Array>();
  private readonly dirty = new Set<number>();
  private readonly bounds: Rect;
  /** The layer's alpha lock: pixels keep their opacity. */
  private readonly alphaLocked: boolean;
  private finished = false;

  constructor(
    private readonly drawing: Drawing,
    private readonly layerId: string,
    private readonly style: StrokeStyle,
  ) {
    const layer = drawing.getLayer(layerId);
    if (layer.locked) throw new Error(`Layer ${layerId} is locked`);
    this.alphaLocked = layer.alphaLocked;
    if (!(style.opacity >= 0 && style.opacity <= 1)) throw new RangeError("Invalid opacity");
    if (style.color.some((c) => !(c >= 0 && c <= 255))) throw new RangeError("Invalid color");
    const canvas = { x: 0, y: 0, width: drawing.width, height: drawing.height };
    // Nothing is painted when the clip is entirely off the canvas.
    this.bounds = style.clip ? (intersect(canvas, style.clip) ?? { ...canvas, width: 0 }) : canvas;
  }

  /**
   * Covers (or uncovers, to undo a pixel-perfect corner) whole pixels, with a pixel-art
   * brush of the given diameter and shape. No anti-aliasing.
   */
  setPixels(pixels: readonly Pixel[], size: number, covered: boolean, shape: StampShape = "round") {
    this.assertActive();
    const stamp = pixelStamp(size, shape);
    for (const p of pixels) {
      for (const o of stamp) {
        const box = { x: p.x + o.x, y: p.y + o.y, width: 1, height: 1 };
        this.forEachPixel(box, (_x, _y, cov, i) => {
          cov[i] = covered ? 1 : 0;
          return true;
        });
      }
    }
  }

  /**
   * Covers (or uncovers) the pixels of `box` for which `inside` returns true (all of them
   * by default): filled shapes and the paint bucket.
   */
  setArea(box: Rect, covered: boolean, inside: (x: number, y: number) => boolean = () => true) {
    this.assertActive();
    const value = covered ? 1 : 0;
    this.forEachPixel(box, (x, y, cov, i) => {
      if (cov[i] === value || !inside(x, y)) return false;
      cov[i] = value;
      return true;
    });
  }

  /** Shows the changes in the drawing. Call once per frame, or after each batch of input. */
  flush() {
    if (this.dirty.size === 0) return;
    const changed: TileSnapshot = new Map();
    for (const key of this.dirty) changed.set(key, this.working.get(key));
    this.dirty.clear();
    this.drawing.restorePixels(this.layerId, changed);
  }

  /** Ends the stroke. Returns it as one undo step, or null if it changed nothing. */
  finish(label: string): Edit | null {
    this.assertActive();
    this.flush();
    this.finished = true;
    if (this.original.size === 0) return null;
    // The tiles as the drawing stores them now (fully transparent ones are dropped).
    const after = this.drawing.getLayer(this.layerId).tiles.snapshot(this.original.keys());
    return replaceTiles(this.layerId, this.original, after, label);
  }

  /** Abandons the stroke and puts the layer back as it was. */
  cancel() {
    this.assertActive();
    this.finished = true;
    this.drawing.restorePixels(this.layerId, this.original);
  }

  private assertActive() {
    if (this.finished) throw new Error("The stroke is finished");
  }

  /**
   * Calls `update` for each canvas pixel of `box`, with the coverage of its tile. When
   * `update` returns true, the pixel is recomputed.
   */
  private forEachPixel(
    box: Rect,
    update: (x: number, y: number, coverage: Float32Array, index: number) => boolean,
  ) {
    const area = intersect(box, this.bounds);
    if (!area) return;
    const tx0 = Math.floor(area.x / TILE_SIZE);
    const ty0 = Math.floor(area.y / TILE_SIZE);
    const tx1 = Math.floor((area.x + area.width - 1) / TILE_SIZE);
    const ty1 = Math.floor((area.y + area.height - 1) / TILE_SIZE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = tileKey(tx, ty);
        const part = intersect(area, {
          x: tx * TILE_SIZE,
          y: ty * TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
        })!;
        const { cov, out, src } = this.tile(key);
        let changed = false;
        for (let y = part.y; y < part.y + part.height; y++) {
          for (let x = part.x; x < part.x + part.width; x++) {
            if (this.outsideMask(x, y)) continue;
            const i = (y - ty * TILE_SIZE) * TILE_SIZE + (x - tx * TILE_SIZE);
            if (update(x, y, cov, i)) {
              this.recompose(src, out, cov[i], i * 4);
              changed = true;
            }
          }
        }
        if (changed) this.dirty.add(key);
      }
    }
  }

  private outsideMask(x: number, y: number): boolean {
    const { clip, clipMask } = this.style;
    return !!clip && !!clipMask && !clipMask[(y - clip.y) * clip.width + (x - clip.x)];
  }

  private tile(key: number) {
    let out = this.working.get(key);
    let cov = this.coverage.get(key);
    if (!out || !cov) {
      const before = this.drawing.getLayer(this.layerId).tiles.snapshot([key]).get(key);
      this.original.set(key, before);
      out = before ? before.slice() : new Uint8ClampedArray(TILE_PIXELS * 4);
      cov = new Float32Array(TILE_PIXELS);
      this.working.set(key, out);
      this.coverage.set(key, cov);
    }
    return { out, cov, src: this.original.get(key) };
  }

  /** Recomputes one pixel from its value before the stroke and its coverage. */
  private recompose(
    src: Uint8ClampedArray | undefined,
    out: Uint8ClampedArray,
    coverage: number,
    j: number,
  ) {
    const sa = this.style.opacity * coverage;
    const keep = 1 - sa;
    const r0 = src ? src[j] : 0;
    const g0 = src ? src[j + 1] : 0;
    const b0 = src ? src[j + 2] : 0;
    const a0 = src ? src[j + 3] : 0;
    if (this.style.mode === "erase") {
      out[j] = Math.round(r0 * keep);
      out[j + 1] = Math.round(g0 * keep);
      out[j + 2] = Math.round(b0 * keep);
      out[j + 3] = Math.round(a0 * keep);
    } else {
      const [r, g, b] = this.style.color;
      out[j] = Math.round(r * sa + r0 * keep);
      out[j + 1] = Math.round(g * sa + g0 * keep);
      out[j + 2] = Math.round(b * sa + b0 * keep);
      out[j + 3] = Math.round(255 * sa + a0 * keep);
    }
    // Rounding must not break the premultiplied invariant (no channel above alpha).
    const a = out[j + 3];
    if (out[j] > a) out[j] = a;
    if (out[j + 1] > a) out[j + 1] = a;
    if (out[j + 2] > a) out[j + 2] = a;
    if (this.alphaLocked) keepAlpha(out, j, src);
  }
}
