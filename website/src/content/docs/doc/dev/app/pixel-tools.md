---
title: Pixel art tools
description: The pixel brush, the pixel eraser, the shapes and the paint bucket, and their algorithms.
sidebar:
  order: 6
---

## Purpose

The pixel art tools change whole pixels, with no anti-aliasing. They paint on the CPU, not with the brush engine. These tools are the pixel brush, the pixel eraser, the line, the rectangle, the ellipse and the paint bucket.

## Files

| File                               | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `src/lib/app/tools/pixel-tools.ts` | The pixel brush and the pixel eraser.                               |
| `src/lib/app/tools/shape-tools.ts` | The line, the rectangle and the ellipse.                            |
| `src/lib/app/tools/fill-tool.ts`   | The paint bucket.                                                   |
| `src/lib/core/brush/pixel-path.ts` | The path of the pen as a chain of pixels. Bresenham, pixel-perfect. |
| `src/lib/core/brush/raster.ts`     | `StrokeRaster`: paints a stroke into the tiles of a layer.          |
| `src/lib/core/brush/shapes.ts`     | The pixels of lines, rectangles and ellipses.                       |
| `src/lib/core/brush/flood-fill.ts` | The area of the paint bucket.                                       |

## Concepts

The algorithms are in `src/lib/core/brush/`. Their pages tell how they work:

- [Pixel brush](/doc/dev/core/pixel-brush/): Bresenham lines, pixel-perfect, stamps, and the coverage mask of `StrokeRaster`.
- [Shapes and fill](/doc/dev/core/shapes-and-fill/): constrained lines, rectangles, the ellipse algorithm, and the scanline flood fill.

This page tells how the tools use these algorithms during a stroke.

## How it works

### Pixel brush and eraser

`pixelTool(id, title, icon, mode)` makes the two tools. `mode` is `"paint"` or `"erase"`. `begin` makes a `StrokeRaster` and a `PixelPathBuilder`. For each sample, `PixelStroke.move`:

1. adds the sample to the path,
2. uncovers the `unpaint` pixels,
3. covers the `paint` pixels with the _stamp_ of the tip.

The stamp (`pixelStamp(size, shape)`) is the list of pixel offsets of the tip: a square, or a round shape. For a round tip, a pixel is in the stamp if its center is in the circle. A small tolerance (0.25) keeps small round tips full on their axes.

The pixel stroke is never busy: it paints at once in `move`. This is fast because it changes few pixels.

### Shapes

A shape goes from the first pixel to the pen. It follows the pen until the pen goes up.

- `move` only records the pixel under the pen.
- `flush` (one time for each frame) draws the shape again, but only if the pen or Shift/Ctrl changed.
- To draw again, it uncovers the last outline, then covers the new outline. With the coverage, the old pixels come back exactly.
- `finish` draws the final shape. A filled shape is filled only at this time: during the drag, only the outline shows.

The keys:

- **Shift** on a line: `snapLineEnd` keeps the line on a pixel art angle (horizontal, vertical, diagonal, or 2:1). The end is a whole number of steps away, so the stairs stay regular.
- **Shift** on a rectangle or an ellipse: a square or a circle.
- **Ctrl**: draws from the center.

The ellipse uses `ellipseOutline` and `ellipseSpans` (see [Shapes and fill](/doc/dev/core/shapes-and-fill/)).

### Paint bucket

The paint bucket does all its work in `begin`. Its stroke is already painted when the pen goes down (`paintedStroke`).

1. It reads the full layer (`readRegion`).
2. `fillArea` finds the pixels to fill. It gives a mask (1 = fill) and the box around it.
3. It covers the mask with `setArea`.

`fillArea` compares each channel of the premultiplied RGBA. A pixel matches if each channel is at most `tolerance` from the clicked pixel.

When `contiguous` is off, it checks all pixels.

When `contiguous` is on, it uses a scanline flood fill (see [Shapes and fill](/doc/dev/core/shapes-and-fill/)).

The fill connects pixels by their sides only (4-connected). Thus, it does not go through a diagonal line of 1 pixel.

### Selection and alpha lock

All the pixel tools get the selection as a clip (`selectionClip`). Pixels outside the selection do not change. If the layer has its alpha locked, the pixels keep their opacity.

## Optimizations

- The shapes draw one time for each frame, not at each sample, and only when something changed.
- `forEachPixel` works tile by tile, and calculates again only the pixels that changed.

## Limits

- Pixel-perfect works only with a size of 1.
- The paint bucket reads only the active layer, not the full image.
