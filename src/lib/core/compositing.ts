// Flattens the visible layers of a drawing into one image, on the CPU.
//
// Used for export, for sending images to Godot, and as the reference the GPU rendering is
// checked against. Follows the W3C Compositing and Blending spec: source-over with
// separable blend modes. "add" is plus-lighter (sum, clamped), like additive blending on
// the GPU. Each layer is rounded to 8 bits after blending, like a GPU render target.

import type { Drawing } from "./drawing";
import { intersect, isIntegerRect, type Rect } from "./geometry";
import type { BlendMode } from "./layer";
import { TILE_SIZE } from "./tiles";

/** Blend function on non-premultiplied channels in [0, 1]: backdrop, source. */
type BlendFn = (cb: number, cs: number) => number;

const hardLight: BlendFn = (cb, cs) =>
  cs <= 0.5 ? cb * 2 * cs : cb + (2 * cs - 1) - cb * (2 * cs - 1);

const BLEND: Record<Exclude<BlendMode, "add">, BlendFn> = {
  normal: (_, cs) => cs,
  multiply: (cb, cs) => cb * cs,
  screen: (cb, cs) => cb + cs - cb * cs,
  overlay: (cb, cs) => hardLight(cs, cb),
  darken: (cb, cs) => Math.min(cb, cs),
  lighten: (cb, cs) => Math.max(cb, cs),
};

export interface CompositeOptions {
  /** Premultiplied RGBA background, 0-255. Transparent by default. */
  background?: readonly [number, number, number, number];
}

/** Composites the visible layers over the given region. Returns premultiplied RGBA. */
export function composite(
  drawing: Drawing,
  rect: Rect,
  options: CompositeOptions = {},
): Uint8ClampedArray {
  if (!isIntegerRect(rect)) throw new RangeError(`Invalid rect ${JSON.stringify(rect)}`);
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  if (options.background) {
    for (let i = 0; i < out.length; i += 4) out.set(options.background, i);
  }
  const area = intersect(rect, { x: 0, y: 0, width: drawing.width, height: drawing.height });
  if (!area) return out;

  for (const layer of drawing.layers) {
    if (!layer.visible || layer.opacity === 0) continue;
    for (const { tx, ty } of layer.tiles.tilesIn(area)) {
      const tile = layer.tiles.getTile(tx, ty);
      // An empty source leaves the backdrop unchanged, in every mode.
      if (!tile) continue;
      const part = intersect(area, {
        x: tx * TILE_SIZE,
        y: ty * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
      })!;
      for (let y = part.y; y < part.y + part.height; y++) {
        let si = ((y - ty * TILE_SIZE) * TILE_SIZE + (part.x - tx * TILE_SIZE)) * 4;
        let di = ((y - rect.y) * rect.width + (part.x - rect.x)) * 4;
        for (let x = 0; x < part.width; x++, si += 4, di += 4) {
          if (tile[si + 3] !== 0) blendPixel(layer.blendMode, layer.opacity, tile, si, out, di);
        }
      }
    }
  }
  return out;
}

/** Blends one premultiplied source pixel over one premultiplied backdrop pixel, in place. */
function blendPixel(
  mode: BlendMode,
  opacity: number,
  src: Uint8ClampedArray,
  si: number,
  dst: Uint8ClampedArray,
  di: number,
) {
  const as = (src[si + 3] / 255) * opacity;
  // A tiny opacity can underflow to 0: the source then changes nothing (and Cs = cs / as
  // would be 0 / 0).
  if (as === 0) return;
  const ab = dst[di + 3] / 255;
  let ao: number;

  if (mode === "add") {
    ao = Math.min(1, as + ab);
    for (let c = 0; c < 3; c++) {
      const value = Math.min(1, (src[si + c] / 255) * opacity + dst[di + c] / 255);
      dst[di + c] = Math.round(Math.min(value, ao) * 255);
    }
  } else {
    const blend = BLEND[mode];
    ao = as + ab * (1 - as);
    for (let c = 0; c < 3; c++) {
      const cs = (src[si + c] / 255) * opacity;
      const cb = dst[di + c] / 255;
      // co = cs·(1 − ab) + cb·(1 − as) + as·ab·B(Cb, Cs), with Cb, Cs non-premultiplied.
      let co = cs * (1 - ab) + cb * (1 - as);
      if (ab > 0) co += as * ab * blend(cb / ab, cs / as);
      // Keep the premultiplied invariant despite rounding: no channel above alpha.
      dst[di + c] = Math.round(Math.min(co, ao) * 255);
    }
  }
  dst[di + 3] = Math.round(ao * 255);
  // Rounding alpha down can leave a channel above it.
  for (let c = 0; c < 3; c++) if (dst[di + c] > dst[di + 3]) dst[di + c] = dst[di + 3];
}
