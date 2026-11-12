---
title: Shapes and fill
description: Pixel art lines, rectangles and ellipses, and the paint bucket's scanline fill.
sidebar:
  order: 25
---

## Purpose

The shape tools draw lines, rectangles and ellipses with whole pixels. The paint bucket fills an area of the same color. These algorithms are in `src/lib/core/brush/shapes.ts` and `src/lib/core/brush/flood-fill.ts`. They compute pixels only. `StrokeRaster` then writes the pixels (see [Pixel art strokes](/doc/dev/core/pixel-brush/)).

## Shapes

### The box of a shape

The user drags from pixel `a` to pixel `b`. `shapeBox(a, b, options)` gives the box of the shape (`PixelBox`: two corners, both included).

- `square`: the two sides are equal. The larger side wins (`squareEnd`).
- `fromCenter`: `a` is the center of the box, not a corner.

### Constrained lines

With Shift, a line keeps a pixel art angle. `snapLineEnd` uses these directions:

| Step   | Angle            |
| ------ | ---------------- |
| (1, 0) | horizontal       |
| (2, 1) | 2:1, about 26.6° |
| (1, 1) | 45°              |
| (1, 2) | 1:2, about 63.4° |
| (0, 1) | vertical         |

A 2:1 line makes regular "stairs" of two pixels. These lines are common in pixel art (isometric views).

The function finds the step nearest to the angle of the drag. Then it puts the end a **whole number of steps** from the start. Thus, all the stairs of the line have the same length.

### Rectangles

`rectOutline` gives the pixels of the outline, each pixel one time. A filled rectangle uses `setArea` with the box.

### Ellipses

`ellipseOutline` uses the algorithm of **Alois Zingl** ("A Rasterizing Algorithm for Drawing Curves"). It is a Bresenham-type algorithm for an ellipse in a box:

- It uses integer operations only.
- It draws the four quarters at the same time, thus the ellipse is symmetric.
- It works for even and odd widths and heights.
- The outline is one pixel thin and 8-connected.

The algorithm keeps an error value. At each step, the error tells if the next pixel moves in x, in y, or in both. A last loop completes the tips of very flat ellipses.

A filled ellipse uses `ellipseSpans`. This function takes the outline and keeps, for each row, the first and the last pixel. The tool fills each row between these two pixels.

## Paint bucket

`fillArea(data, width, height, x, y, options)` gives the area to fill: a mask (1 = fill) and the box around it.

### Same color

The bucket compares the pixels of the layer with the clicked pixel, channel by channel, on the premultiplied RGBA values. A pixel matches if no channel differs by more than `tolerance` (0 to 255). With 0, only the exact color matches.

### Two modes

- **Not contiguous**: every matching pixel of the layer. A simple loop over all the pixels.
- **Contiguous**: only the matching pixels connected to the clicked pixel by their sides.

### Scanline fill

A simple flood fill puts each pixel on a stack, and then its four neighbors. A large area then gives millions of stack items. The **scanline** fill does less work:

1. Take a pixel from the stack.
2. Go left and go right while the pixels match. This gives a row segment.
3. Mark the full segment.
4. For each pixel of the segment, put the pixel above and the pixel below on the stack, if they are not marked.

```ts
// src/lib/core/brush/flood-fill.ts
let left = i;
while (left > row && !mask[left - 1] && matches(left - 1)) {
  left--;
}
```

The mask also tells which pixels are done. Thus, the algorithm never fills a pixel two times.

The function keeps the box of the marked pixels (`minX`, `maxX`, `minY`, `maxY`). The tool then works only in this box, not on the full canvas.

## Limits

- The bucket reads the active layer only, not all the visible layers.
- The tolerance applies to each channel. It does not measure a perceptual color difference.
