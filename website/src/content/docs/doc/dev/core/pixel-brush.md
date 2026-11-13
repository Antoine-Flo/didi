---
title: Pixel art strokes
description: Bresenham lines, pixel-perfect corners, stamps and the coverage mask of a pixel stroke.
sidebar:
  order: 24
---

## Purpose

The drawing tools (pencil, eraser, shapes, bucket) paint whole pixels, without anti-aliasing, on the CPU. The `core/brush` module computes which pixels change and writes them into the tiles of the layer.

## Files

| File                               | Purpose                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/core/brush/pixel-path.ts` | The path of the pen as a chain of pixels. Pixel-perfect.                             |
| `src/lib/core/brush/raster.ts`     | `StrokeRaster`: writes a stroke into the tiles. Stamps.                              |
| `src/lib/core/brush/shapes.ts`     | Lines, rectangles, ellipses (see [Shapes and fill](/doc/dev/core/shapes-and-fill/)). |
| `src/lib/core/brush/flood-fill.ts` | The area of the paint bucket.                                                        |
| `src/lib/app/tools/pixel-tools.ts` | The tools that use these modules.                                                    |

## Concepts

### Pixels from positions

The pen gives positions with decimals, for example (10.7, 4.2). A pixel has whole coordinates. `Math.floor` gives the pixel under the pen: (10, 4).

### Bresenham lines

The pen sends samples at intervals. Between two samples, there can be a gap of several pixels. `pixelLine(a, b)` fills the gap with the **Bresenham algorithm**. This algorithm finds the pixels nearest to the ideal line with integer additions only. The line is **8-connected**: two pixels of the line touch by a side or by a corner.

### Pixel-perfect

A free-hand line often has "L" corners: three pixels where the middle pixel touches the two others by a side, and the two others touch by a corner.

```
before        after
■ ■           ■
  ■ ■           ■
```

In pixel art, these corners make a line look thick. **Pixel-perfect** mode removes the middle pixel, as Aseprite does. `PixelPathBuilder.isCorner` detects the pattern on the last three pixels of the path:

```ts
// src/lib/core/brush/pixel-path.ts
return side(a, b) && side(b, c) && diagonal(a, c);
```

The middle pixel can be already painted. Thus, `add` returns two lists: `paint` (new pixels) and `unpaint` (pixels to restore).

### Stamps

A brush larger than 1 pixel paints a **stamp** on each pixel of the path. `pixelStamp(size, shape)` gives the offsets of the stamp from its center. A square stamp is all the pixels of an n × n box. A round stamp keeps the pixels whose center is in the circle. A small tolerance (+0.25) keeps small circles full on their axes.

### The coverage mask

`StrokeRaster` keeps a **coverage** value (0 or 1) for each pixel that the stroke touched. It never adds paint on paint. It always computes each pixel again from two values:

- the pixel **before the stroke** (`original`),
- its coverage.

```ts
// src/lib/core/brush/raster.ts (paint mode)
const sa = this.style.opacity * coverage;
const keep = 1 - sa;
out[j] = Math.round(r * sa + r0 * keep);
```

This has two results:

1. The stroke opacity is a **ceiling**. A stroke at 50 % that goes two times over the same pixel stays at 50 %.
2. When pixel-perfect removes a corner, the coverage goes back to 0, and the pixel gets back its **exact** value before the stroke.

## How it works

1. The tool makes a `StrokeRaster` for the active layer, with a color, an opacity, a mode (`paint` or `erase`), and the selection (`clip`, `clipMask`).
2. For each sample, the tool gives the position to a `PixelPathBuilder`. The builder returns the pixels to paint and to unpaint.
3. The tool calls `setPixels(paint, size, true)` and `setPixels(unpaint, size, false)`.
4. `forEachPixel` finds the tiles that the stamp touches. For each tile, it gets a working copy (`tile`), the first time only. It skips the pixels outside the selection mask. It recomputes the changed pixels (`recompose`) and marks the tile as dirty.
5. The tool calls `flush` one time for each frame. `flush` puts the dirty tiles into the drawing, and the view shows them.
6. At the end, `finish` gives one undo step (`replaceTiles`) with the tiles before and after.

### Erase mode

In erase mode, `recompose` multiplies all four channels (premultiplied) by `1 − sa`. The pixel becomes more transparent.

### Premultiplied invariant

In premultiplied RGBA, a color channel can never be larger than the alpha. The rounding of `recompose` can break this rule by 1. Thus, `recompose` limits each channel to the alpha after the rounding.

### Alpha lock

If the layer has its alpha locked, `keepAlpha` puts back the alpha of the pixel before the stroke. The stroke then changes only the color of the pixels that are already there.

## Optimizations

- **Tile copies on demand.** The stroke copies a tile the first time that it touches it. The other tiles stay shared.
- **Dirty tiles.** `flush` sends only the tiles that changed since the last frame.
- **No work for unchanged pixels.** `setArea` skips a pixel whose coverage already has the correct value.

## Limits

- The coverage is 0 or 1 only: no anti-aliasing.
- One `StrokeRaster` writes into one layer.
