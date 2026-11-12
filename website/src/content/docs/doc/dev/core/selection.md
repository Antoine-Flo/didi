---
title: Selection
description: The selection state, lasso masks, floating content, transforms and handles.
sidebar:
  order: 4
---

## Purpose

The selection limits where the tools paint. It can also hold **floating content**: pixels that the user lifts from a layer to move, scale, turn, skew or mirror them.

## Files

| File                                  | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/core/selection/selection.ts` | The selection state, the `Selection` holder and the selection undo step. |
| `src/lib/core/selection/shape.ts`     | The mask of a free shape (lasso, inversion), and its outline.            |
| `src/lib/core/selection/floating.ts`  | Lifts content from a layer and shows it at a new place.                  |
| `src/lib/core/selection/placement.ts` | The box of floating content and its transform (turn, skew, mirror).      |
| `src/lib/core/selection/handles.ts`   | The handles around a selection, and what the pen grabs at a point.       |

## Concepts

### The state

```ts
// src/lib/core/selection/selection.ts
export interface SelectionState {
  readonly rect: Rect | null; // null: no selection
  readonly transform?: Transform | null; // floating content only
  readonly shape?: SelectionShape | null; // null: all the pixels of rect
  readonly floating: Floating | null;
  readonly pivot?: Point | null; // the center of rotation, if the user moved it
}
```

A state never changes. To change the selection, the code makes a new state and gives it to `Selection.set`. This makes undo simple: an undo step keeps the state before and the state after (`selectionEdit`).

### The shape: a mask

A rectangle selection needs only `rect`. A lasso or an inverted selection also has a `shape`. The shape is a **mask**: one byte for each pixel of the rectangle, 1 if the pixel is selected, 0 if not.

```ts
export interface SelectionShape {
  readonly mask: Uint8Array; // row by row
  readonly width: number;
  readonly height: number;
}
```

`shapeOf` returns `null` when all the bytes are 1. Thus, a full mask always becomes a plain rectangle.

The mask keeps the size at which the user made it. When the rectangle changes size, `shapeMask` stretches the mask: each new pixel takes the mask value under its center. This is "nearest neighbor" sampling. `shapeMask` keeps the stretched mask in a `WeakMap`, so that the next call with the same size is free.

### The clip

The tools use `selectionClip(state)`. It gives the rectangle (`clip`) and the mask (`clipMask`). The brush engine copies a pixel to the layer only if it is in `clip` and its mask value is 1.

### Floating content

When the user moves selected pixels, the editor **lifts** them. The content then "floats" over the layer:

```ts
export interface Floating {
  readonly layerId: string;
  readonly pixels: Uint8ClampedArray; // the original pixels, premultiplied
  readonly width: number;
  readonly height: number;
  readonly origin: Rect; // where they come from
  readonly original: TileSnapshot; // all the tiles of the layer before the lift
  readonly base: TileSnapshot; // all the tiles of the layer without the content
}
```

The important idea: **the code always draws the content again from the original pixels**. It never transforms the pixels that it showed before. This has two results:

1. The content can go over other pixels of the layer and then go away. The other pixels do not change, because the code draws them again from `base`.
2. The user can make the content small and then large again without loss. Each new size samples the original pixels.

Snapshots share tiles (see [Tiles](/doc/dev/core/tiles/)). Thus, `original` and `base` cost almost no memory, even if they hold all the tiles of the layer.

### Placement and transform

A placement is the box of the content (a rectangle in whole pixels) plus an optional **affine transform**. A point `(x, y)` of the box shows at this point on the canvas:

```
(a·x + b·y + tx,  c·x + d·y + ty)
```

The six numbers `a, b, c, d, tx, ty` can express a move, a rotation, a skew and a mirror. They cannot express a perspective.

The box and the transform are separate. When content is turned, a scale handle changes the box along its own sides, in whole pixels. Then the transform turns the new box.

The functions in `placement.ts`:

| Function   | What it does                                                                  |
| ---------- | ----------------------------------------------------------------------------- |
| `toCanvas` | A point of the box to the canvas.                                             |
| `toBox`    | A point of the canvas to the box. It uses the inverse of the 2 × 2 matrix.    |
| `moved`    | Adds a translation.                                                           |
| `rotated`  | Turns around a pivot point. It multiplies a rotation matrix by the transform. |
| `skewed`   | Moves one side along itself. The opposite side stays in place.                |
| `mirrored` | Mirrors across a vertical or horizontal line of the box.                      |
| `boundsOf` | The smallest rectangle of whole pixels around the four corners.               |

After a rotation, a skew or a mirror, `simplified` makes sure that the result goes back to a plain rectangle when the transform is "nothing" again. For example, after two mirrors, or after a turn back to 0°. A tolerance (`EPSILON = 1e-6`) accepts the small errors of floating-point numbers.

## How it works

### Make a lasso mask

`pathSelection(points)` makes a selection from the points of the lasso. `pathMask` fills the mask with a **scanline** algorithm:

1. For each row of pixels, take the horizontal line through the center of the row (`y + 0.5`).
2. For each segment of the closed path, find where it crosses this line. Keep the `x` of the crossing in the list of the row.
3. Sort the crossings of each row.
4. Fill the pixels between the crossings 1 and 2, 3 and 4, and so on. This is the "even-odd" rule: a point is inside if a line from it crosses the path an odd number of times.
5. Then mark the pixels on the path itself (`markLine`). Thus, a thin lasso still selects the pixels that it goes through.

Optimization: each segment adds crossings only to the rows between its two ends. A long lasso has many short segments, and each one touches only a few rows. A simple method tests each segment with each row, and is much slower.

### Draw the outline

`maskOutline` finds the edges between selected and not selected pixels:

1. For each horizontal line between two rows, it compares the pixel above and the pixel below. Where they are different, there is an edge.
2. It merges the edges that touch into one long segment ("run").
3. It does the same for the vertical lines between columns.

The view draws these runs. `selectionOutline` keeps the result in a `WeakMap`, keyed by the mask. Thus, the outline is not calculated again when the content only moves or turns.

### Lift content

`lift(drawing, layerId, rect, mask)` in `floating.ts`:

1. Takes a snapshot of all the tiles of the layer (`original`).
2. Reads the pixels of the rectangle.
3. If there is a mask, it moves the pixels that are not selected into a second buffer (`left`). They stay in the layer.
4. Writes `left` into the layer. The selected pixels are now gone from the layer.
5. Takes a second snapshot (`base`): the layer without the content.

### Show content at a new place

`showFloating(drawing, floating, from, to)`:

1. Puts back the `base` tiles where the content was (`from`). This removes the old image of the content.
2. Reads the layer in the new area (`to`).
3. Lays the content over it (`layOver`). This is a "source-over" blend of premultiplied pixels: `result = source + backdrop × (1 − source alpha)`.
4. Writes the result into the layer.

`layOver` has three paths:

- **Move by whole pixels** (`layOverMoved`): no scale and no transform. Each pixel is copied as it is. The content stays exact.
- **Exact sampling** (`sampleExact`): for each pixel of the new area, the code finds the point of the content under its center and takes that original pixel. This is right for pixel art: there are no new colors.
- **Smooth sampling** (`sampleSmooth`): the code mixes the four original pixels around the point, with weights (bilinear interpolation). This is right for painting: the edges do not look jagged.

Optimization: the transform from the canvas to the box is affine. Thus, one step to the right on the canvas is always the same step in the box. The code calculates the start point and the two steps one time. Then, for each pixel, it adds the steps. It does not call `toBox` for each pixel.

### Lay the content

`appliedState` gives the selection after the content is laid. The content stays in the layer as it is shown. The selection becomes the rectangle around it, cut to the canvas. If the content was turned, the new selection is not a rectangle. Thus, the function makes a mask: a pixel is selected if a selected pixel of the content shows at its center.

### Invert

`invertedState` makes a mask of the full canvas, all 1. Then it writes 0 where the current selection is. `selectionOfMask` then cuts the mask to the rectangle around its 1 values.

### Handles

`selectionHandles(placement, zoom, pivot)` gives the handles to draw:

- **Bounds handles** (inside the frame): move one edge of the selection. The pixels do not change. They show only when the selection is at least 64 screen pixels wide.
- **Content handles** (outside the frame, 8 of them): scale the content.
- **Pivot** (a cross): moves the center of rotation.

Around the frame, a band of 32 screen pixels has no handles. Near a corner, the band turns the content. Along a side, it skews the content.

`zoneAt` tells what the pen grabs at a point. Each handle has a `shape` (what the view draws) and a `grab` area (what the pen can touch, larger for a pen). The view and the hit test use the same rectangles, so they always agree.

All sizes are in screen pixels. The functions divide them by the zoom to get canvas pixels. Thus, the handles have the same size on the screen at all zoom levels.

`scaleRect` scales a box when a handle moves. If the handle goes past the opposite side, the box grows again on the other side, and the function tells where to mirror the content.

## Limits

- The transform is affine: there is no perspective.
- The mask of a shape is stretched with nearest-neighbor sampling. Its edges do not become smooth.
- Only one floating content can exist at a time, on one layer.
