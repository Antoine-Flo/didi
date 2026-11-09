// PNG encoding and decoding, without a browser: used to save and load .didi files (in a
// worker, and in tests).
//
// Encoding writes 8-bit RGBA, with the best filter for each row. Decoding reads the
// common kinds of PNG (gray, RGB, palette, with or without alpha, 1 to 16 bits), so that
// a layer edited in another program can be read back. Interlaced images are not supported.
// Pixels are straight (not premultiplied) RGBA, as in every PNG.

import { m } from "#lib/paraglide/messages.js";
import { unzlibSync, zlibSync } from "fflate";

export interface PngImage {
  width: number;
  height: number;
  /** Straight RGBA, 8 bits per channel. */
  data: Uint8ClampedArray;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Encodes straight RGBA pixels. `level` is the zlib compression level (0-9): the default
 * favors speed, the result is still much smaller than the raw pixels.
 */
export function encodePng(
  image: PngImage,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6,
): Uint8Array {
  const { width, height, data } = image;
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) {
    throw new RangeError(`Invalid image size ${width} × ${height}`);
  }
  if (data.length !== width * height * 4) {
    throw new RangeError("Pixel data does not match the size");
  }

  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = data[row + i];
        const a = i >= 4 ? data[row + i - 4] : 0;
        const b = prev >= 0 ? data[prev + i] : 0;
        const c = i >= 4 && prev >= 0 ? data[prev + i - 4] : 0;
        const v = (x - predict(f, a, b, c)) & 0xff;
        out[i] = v;
        // Small signed values compress best.
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    const o = y * (stride + 1);
    filtered[o] = best;
    filtered.set(candidates[best], o + 1);
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, adaptive filtering, no interlace

  return concat([
    new Uint8Array(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(filtered, { level })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function predict(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    default:
      return 0;
  }
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Decodes a PNG into straight RGBA. Throws a readable error if it is not a valid PNG. */
export function decodePng(bytes: Uint8Array): PngImage {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error(m.png_error_not_png());
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let pos = 8;
  let ended = false;
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const end = pos + 8 + length;
    if (end + 4 > bytes.length) {
      throw new Error(m.png_error_truncated());
    }
    if (crc32(bytes, pos + 4, end) !== view.getUint32(end)) {
      throw new Error(m.png_error_corrupted_chunk({ chunk: type }));
    }
    const body = bytes.subarray(pos + 8, end);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = body[8];
      colorType = body[9];
      if (body[12] !== 0) {
        throw new Error(m.png_error_interlaced());
      }
    } else if (type === "PLTE") {
      palette = body;
    } else if (type === "tRNS") {
      transparency = body;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      ended = true;
      break;
    }
    pos = end + 4;
  }
  if (!ended || width === 0 || height === 0 || idat.length === 0) {
    throw new Error(m.png_error_truncated());
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const validDepths = colorType === 3 ? [1, 2, 4, 8] : colorType === 0 ? [1, 2, 4, 8, 16] : [8, 16];
  if (channels === undefined || !validDepths.includes(depth)) {
    throw new Error(m.png_error_unsupported_format({ colorType, depth }));
  }
  if (colorType === 3 && !palette) {
    throw new Error(m.png_error_palette_missing());
  }

  let raw: Uint8Array;
  try {
    raw = unzlibSync(concat(idat));
  } catch {
    throw new Error(m.png_error_corrupted_data());
  }
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < (stride + 1) * height) {
    throw new Error(m.png_error_truncated_data());
  }

  // Unfilter in place, row by row.
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) {
      throw new Error(m.png_error_corrupted_data());
    }
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rows[row + i - bpp] : 0;
      const b = y > 0 ? rows[row - stride + i] : 0;
      const c = i >= bpp && y > 0 ? rows[row - stride + i - bpp] : 0;
      rows[row + i] = (raw[src + i] + predict(filter, a, b, c)) & 0xff;
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const sample = (row: number, index: number): number => {
    // The `index`-th sample of a row, scaled to 8 bits.
    if (depth === 8) {
      return rows[row + index];
    }
    if (depth === 16) {
      return rows[row + index * 2];
    }
    const perByte = 8 / depth;
    const byte = rows[row + Math.floor(index / perByte)];
    const shift = 8 - depth * ((index % perByte) + 1);
    const value = (byte >> shift) & ((1 << depth) - 1);
    return colorType === 3 ? value : Math.round((value * 255) / ((1 << depth) - 1));
  };
  // A gray or RGB color marked transparent by tRNS (compared at full precision).
  const transparentKey =
    transparency && (colorType === 0 || colorType === 2)
      ? Array.from(
          { length: colorType === 0 ? 1 : 3 },
          (_, i) => (transparency![i * 2] << 8) | transparency![i * 2 + 1],
        )
      : null;
  const fullSample = (row: number, index: number): number => {
    if (depth === 16) {
      return (rows[row + index * 2] << 8) | rows[row + index * 2 + 1];
    }
    if (depth === 8) {
      return rows[row + index];
    }
    const perByte = 8 / depth;
    const byte = rows[row + Math.floor(index / perByte)];
    return (byte >> (8 - depth * ((index % perByte) + 1))) & ((1 << depth) - 1);
  };

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const i = sample(row, x);
        if (i * 3 + 2 >= palette!.length) {
          throw new Error(m.png_error_palette_index());
        }
        out[o] = palette![i * 3];
        out[o + 1] = palette![i * 3 + 1];
        out[o + 2] = palette![i * 3 + 2];
        out[o + 3] = transparency && i < transparency.length ? transparency[i] : 255;
        continue;
      }
      const first = x * channels;
      if (colorType === 0 || colorType === 4) {
        const g = sample(row, first);
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = colorType === 4 ? sample(row, first + 1) : 255;
      } else {
        out[o] = sample(row, first);
        out[o + 1] = sample(row, first + 1);
        out[o + 2] = sample(row, first + 2);
        out[o + 3] = colorType === 6 ? sample(row, first + 3) : 255;
      }
      if (transparentKey && transparentKey.every((k, i) => fullSample(row, first + i) === k)) {
        out[o + 3] = 0;
      }
    }
  }
  return { width, height, data: out };
}
