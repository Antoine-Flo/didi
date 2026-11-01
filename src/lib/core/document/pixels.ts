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
