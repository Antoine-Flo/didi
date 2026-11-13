---
title: Overlays
description: The grids, the selection outline and the brush cursor, and the contrast blend mode.
sidebar:
  order: 3
---

## Purpose

The overlays are the items over the drawing that are not part of the drawing: the grids, the selection outline, the selection preview and the pointer. They must be visible on all colors, on light areas and on dark areas.

## Files

| File                               | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/render/contrast-blend.ts` | The `contrast` blend mode: a GPU shader.                                |
| `src/lib/render/grid-view.ts`      | The pixel grid and the tile grid.                                       |
| `src/lib/render/selection-view.ts` | The selection outline, its handles, and the preview of a new selection. |
| `src/lib/render/brush-cursor.ts`   | The pointer: pixel-art tip, color picker.                               |

## Contrast blend

### The problem

A white line is not visible on a white drawing. A black line is not visible on a black drawing. An overlay must be visible on all colors.

### Blend modes and shaders

When the GPU draws an item over other pixels, a **blend mode** tells how to mix the two colors. Some blend modes are fixed operations of the GPU (normal, add, screen). Other blend modes need a **shader**: a small program that the GPU runs for each pixel.

A shader blend mode must read the pixels under the item. Thus, PixiJS must keep a copy of the current image: the **back buffer**. `CanvasView.svelte` enables it with `useBackBuffer: true`.

### The algorithm

`contrast-blend.ts` adds a blend mode `contrast` to PixiJS. For each pixel, the shader:

1. Calculates the lightness of the color under the item (`back`). It uses the standard weights for the eye: 0.299 red, 0.587 green, 0.114 blue.
2. Selects black if the color is light (lightness > 0.5), or white if it is dark.
3. Moves the color in the direction of this target. The amount is half the alpha of the item.

```glsl
// src/lib/render/contrast-blend.ts (WebGL version)
vec3 contrast(vec3 base, float amount) {
  float light = dot(base, vec3(0.299, 0.587, 0.114));
  return mix(base, light > 0.5 ? vec3(0.0) : vec3(1.0), amount);
}
```

Thus, a contrast line makes light pixels darker and dark pixels lighter. It is visible everywhere. The file has the same shader two times: GLSL for WebGL, and WGSL for WebGPU.

The pixel grid and the selection preview use this blend mode.

## Grids

`GridView` draws two grids. Each grid can show alone.

- **Pixel grid**: one line on each pixel edge. It shows from zoom 8 (`GRID_FROM_ZOOM`), when the pixels are large on the screen. It uses the contrast blend mode, at strength 0.35.
- **Tile grid**: a line every N pixels, for pixel-art tiles (for example 16 × 16). It shows when a tile is at least 8 screen pixels. It uses a blue color, so that the user does not confuse it with the pixel grid or the checkerboard.

The grid draws only the lines in the visible area (`visibleRect`, see [Camera and zoom](../camera/)). On a canvas of 4000 × 4000 pixels at zoom 20, the screen shows maybe 100 columns. The grid draws 100 lines, not 4000.

Where a tile line is, the grid does not draw a pixel line. If not, the pixel line shows at the sides of the tile line.

The lines use `pixelLine: true`. PixiJS then draws each line with a width of one device pixel, at all zooms.

## Selection

`SelectionView` shows two items.

### The selection outline

The outline is white, with black dashes. Thus, it is visible on all colors. Every 150 ms, the dashes move by one dash length (`flush` changes the phase). This is the "marching ants" effect.

A rectangle selection draws its four edges. A lasso selection draws its outline: a list of segments (`OutlineRun`) in the pixels of its box. The selection can be moved, scaled and turned. `toCanvas` of `core/selection/placement.ts` converts each point to canvas pixels.

The dash length is at minimum 4 screen pixels (`4 / zoom` in canvas pixels). On a very long outline, the dashes get longer, so that the outline has a maximum of about 2000 dashes. If not, the outline has too many segments and the frame is slow.

With handles, the view also draws them:

| Handle    | Shape         | Use                         |
| --------- | ------------- | --------------------------- |
| `bounds`  | Rounded bar   | Moves one edge.             |
| `content` | Square        | Scales the content.         |
| `pivot`   | Circle, cross | The center of the rotation. |

The positions of the handles come from `selectionHandles` in `core/selection/handles.ts`. The same function tells the tools where the handles are. Thus, the image and the hit test always agree.

### The selection preview

While the user makes a selection (for example with the lasso), the view shows the exact pixels that the selection will contain. The preview is a sprite with a mask texture: white where the mask is 1, transparent where it is 0. It uses the contrast blend mode.

If the new mask has the same size as the last one, the view uploads the new pixels into the same texture. It does not make a new texture each time.

## Brush cursor

`BrushCursor.draw` shows one of these items:

| Kind                    | Image                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `square`, `pixel-round` | A pixel-art tip: the exact pixels that the tool will paint. |
| `picker`                | A pipette. Its tip is on the pixel that the tool picks.     |
| `none`                  | Nothing.                                                    |

The pixel-art tip is in canvas pixels, so it covers exactly the pixels under it. The pointer of the system stays visible over the tip and shows where the pen is.

The pipette is in screen pixels. The view draws it itself, because the custom pointer images of the system are at the wrong position on screens with a scale.

### Pixel-art tip

With a color, the tip shows its pixels in the color and the opacity that they will get. A round tip comes from `pixelStamp` in `core/brush/raster.ts`: the list of its pixels, row by row. The cursor draws one rectangle for each row, not one rectangle for each pixel.

Without a color (an eraser), the tip shows its outline. For a round tip, `drawStampOutline` finds the outer edges: for each pixel, an edge is outside if the pixel next to it is not in the tip. The outline is drawn two times: white, one screen pixel off, then black. Thus, it is visible on all colors.

## Limits

- The contrast blend mode needs the back buffer. This costs one more copy of the image for each frame.
- The contrast blend mode gives gray on a middle gray: lightness near 0.5 moves the color only a little.
- The pixel grid shows only from zoom 8. Below, the lines cover too much of the drawing.
