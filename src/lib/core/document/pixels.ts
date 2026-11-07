// Conversions between straight alpha (browser images, PNG files) and premultiplied
// alpha (Didi's pixel format).

/** Straight RGBA → premultiplied RGBA, in a new buffer. */
export function premultiply(straight: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(straight.length);
  for (let i = 0; i < straight.length; i += 4) {
    const a = straight[i + 3];
    out[i] = Math.round((straight[i] * a) / 255);
    out[i + 1] = Math.round((straight[i + 1] * a) / 255);
    out[i + 2] = Math.round((straight[i + 2] * a) / 255);
    out[i + 3] = a;
  }
  return out;
}

/** Premultiplied RGBA → straight RGBA, in a new buffer. Transparent pixels become all zero. */
export function unpremultiply(premultiplied: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(premultiplied.length);
  for (let i = 0; i < premultiplied.length; i += 4) {
    const a = premultiplied[i + 3];
    if (a === 0) continue;
    out[i] = Math.round((premultiplied[i] * 255) / a);
    out[i + 1] = Math.round((premultiplied[i + 1] * 255) / a);
    out[i + 2] = Math.round((premultiplied[i + 2] * 255) / a);
    out[i + 3] = a;
  }
  return out;
}

/**
 * Gives a painted pixel back its opacity from before, keeping its new color (alpha lock).
 * `out` holds the pixel as painted at `j`, `before` the same pixel before painting at `k`
 * (undefined: it was transparent). Both premultiplied. A pixel that was transparent stays
 * so, and one erased completely keeps its old color.
 */
export function keepAlpha(
  out: Uint8ClampedArray,
  j: number,
  before: Uint8ClampedArray | undefined,
  k = j,
) {
  const a0 = before ? before[k + 3] : 0;
  const a = out[j + 3];
  if (a0 === 0 || a === 0) {
    for (let c = 0; c < 4; c++) out[j + c] = before ? before[k + c] : 0;
    return;
  }
  for (let c = 0; c < 3; c++) out[j + c] = Math.min(a0, Math.round((out[j + c] * a0) / a));
  out[j + 3] = a0;
}
