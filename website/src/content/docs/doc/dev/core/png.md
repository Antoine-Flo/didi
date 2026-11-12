---
title: PNG
description: How Didi encodes and decodes PNG images without a browser.
sidebar:
  order: 23
---

## Purpose

`src/lib/core/file/png.ts` encodes and decodes PNG images in pure TypeScript. A browser can decode PNG, but only on the main thread or with canvas APIs. The file worker and the tests have no canvas. Thus, Didi has its own PNG code. It uses `fflate` for the zlib compression.

## Concepts

### Structure of a PNG file

A PNG file starts with an 8-byte **signature**. Then it has a sequence of **chunks**. Each chunk has:

1. a length (4 bytes),
2. a type of 4 letters, for example `IHDR`,
3. the data,
4. a **CRC-32** (4 bytes): a checksum of the type and the data.

The chunks that Didi uses:

| Chunk  | Contents                                                     |
| ------ | ------------------------------------------------------------ |
| `IHDR` | Width, height, bit depth, color type, interlace.             |
| `PLTE` | The palette, for palette images.                             |
| `tRNS` | Transparency, for palette, gray or RGB images without alpha. |
| `IDAT` | The compressed pixels. There can be several `IDAT` chunks.   |
| `IEND` | The end of the file.                                         |

### Filters

Before the compression, PNG changes each row with a **filter**. A filter replaces each byte by its difference from a prediction. The prediction uses the neighbors: `a` (left), `b` (above), `c` (above left).

| Filter | Prediction                                 |
| ------ | ------------------------------------------ |
| 0      | 0 (no filter)                              |
| 1      | `a`                                        |
| 2      | `b`                                        |
| 3      | the average of `a` and `b`                 |
| 4      | Paeth: the neighbor nearest to `a + b − c` |

In a smooth image, the prediction is near the real value. Thus, the differences are small numbers, and small numbers compress well.

## How it works

### Encode

`encodePng` writes 8-bit RGBA only. For each row, it tries the 5 filters and keeps the best one. The score of a filter is the sum of the absolute values of the differences, read as signed bytes:

```ts
// src/lib/core/file/png.ts
const v = (x - predict(f, a, b, c)) & 0xff;
// Small signed values compress best.
score += v < 128 ? v : 256 - v;
```

This heuristic is the one that libpng recommends. Then the encoder compresses all the filtered rows with zlib, and writes the `IHDR`, `IDAT` and `IEND` chunks.

### CRC-32

The CRC-32 uses a table of 256 values, computed one time when the module loads. With the table, the checksum needs one table read for each byte, not 8 bit operations.

### Decode

`decodePng` reads all the common types of PNG, so that the user can edit a layer in a different program:

1. It checks the signature.
2. It reads the chunks and checks the CRC of each one.
3. It joins the `IDAT` chunks and decompresses them.
4. It removes the filters, row by row (the inverse of the encoding).
5. It converts each pixel to 8-bit RGBA:
   - gray, gray + alpha, RGB, RGBA, or palette;
   - depths of 1, 2, 4, 8 or 16 bits. A 16-bit sample keeps its high byte. A 1-, 2- or 4-bit gray sample is scaled to 0–255.
   - `tRNS` gives the alpha of the palette colors, or marks one gray or RGB color as transparent. The decoder compares this color at full precision (16 bits), before the scale to 8 bits.

The result is straight RGBA, as in every PNG.

## Limits

- The decoder refuses **interlaced** PNG (Adam7).
- The decoder ignores color profiles and gamma chunks.
- The encoder writes 8-bit RGBA only, also for opaque or gray images.
