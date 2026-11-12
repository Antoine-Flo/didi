---
title: Drawing view
description: How Didi shows a drawing on the screen with PixiJS.
sidebar:
  order: 1
---

## Purpose

The drawing view shows the drawing on the screen. It shows the layers, the checkerboard under the transparent areas, the grids, the selection and the brush cursor. It uses PixiJS, a library that draws 2D images with the GPU (WebGL).

The view does not change the drawing. It only reads it, and it listens for changes.

## Files

| File                                      | Purpose                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/render/drawing-view.ts`          | The full view. Collects the changes and applies them one time per frame.                   |
| `src/lib/render/layer-view.ts`            | One layer: one sprite for each tile that is not empty.                                     |
| `src/lib/render/camera.ts`                | The transform between canvas pixels and screen pixels (see [Camera and zoom](../camera/)). |
| `src/lib/render/grid-view.ts`             | The pixel grid and the tile grid (see [Overlays](../overlays/)).                           |
| `src/lib/render/selection-view.ts`        | The selection outline and its handles.                                                     |
| `src/lib/render/brush-cursor.ts`          | The pointer over the canvas.                                                               |
| `src/lib/render/contrast-blend.ts`        | A blend mode that stays visible on light and dark colors.                                  |
| `src/lib/app/ui/canvas/CanvasView.svelte` | Makes the PixiJS application, the view, and the frame loop.                                |

## Concepts

### GPU, texture, sprite

The GPU cannot read the memory of JavaScript directly. To show an image, the code must copy the pixels to the GPU. This copy is an **upload**. On the GPU, the image is a **texture**.

A **sprite** is a rectangle on the screen that shows a texture. PixiJS can move, scale and turn a sprite without a new upload. Thus, a pan or a zoom is fast: the GPU only draws the same textures at a different place.

An upload is slow when the texture is large. The view uses tiles to make the uploads small.

### Tiles

A layer keeps its pixels in tiles of 256 × 256 pixels (`TILE_SIZE` in `src/lib/core/document/tiles.ts`). An empty tile does not exist in memory. The layer is **sparse**: a large canvas with a small drawing uses little memory.

The view follows the same structure. Each tile that is not empty has one sprite with its own texture. An empty tile has no sprite.

### Premultiplied alpha

The tiles keep their pixels in **premultiplied alpha**. In this format, the red, green and blue values are already multiplied by the alpha. For example, red at 50 % opacity is `(128, 0, 0, 128)`, not `(255, 0, 0, 128)`.

The GPU blends premultiplied colors with fewer operations, and the edges of the strokes do not get dark borders. The view tells PixiJS about this format:

```ts
// src/lib/render/layer-view.ts
const source = new BufferImageSource({
  resource: bytes,
  width: TILE_SIZE,
  height: TILE_SIZE,
  alphaMode: "premultiplied-alpha",
  scaleMode: this.scaleMode,
});
```

## How it works

### The scene tree

PixiJS draws a tree of containers. A container transforms all its children. `DrawingView` makes this tree:

```
root
├── canvasRoot          (the camera transform applies here)
│   ├── checker         (checkerboard)
│   ├── previewMask
│   ├── layersRoot
│   │   ├── layer 1 container → tile sprites
│   │   └── layer 2 container → tile sprites
│   ├── grid, tileLines
│   ├── selectionDraft, selection
│   └── cursor          (pixel-art tip)
├── pointerRing, pointerCross, pointerPicker   (in screen pixels)
```

The items in `canvasRoot` use canvas pixels. The camera sets the position, the scale and the rotation of `canvasRoot` only. Thus, one change moves all the canvas items together.

The pointers are outside `canvasRoot`. They use screen pixels, so that their size on the screen does not change with the zoom.

### From a change to the screen

The drawing sends a notification for each change (`drawing.subscribe`). The view does not update the GPU immediately. It only records what changed:

| Change           | What the view records                                  |
| ---------------- | ------------------------------------------------------ |
| `layer-added`    | Makes a new `LayerView`. The order must change.        |
| `layer-removed`  | Removes the `LayerView`. The order must change.        |
| `layer-moved`    | The order must change.                                 |
| `layer-updated`  | The visibility, the opacity or the blend mode changed. |
| `pixels-changed` | The tiles that changed, and the area in each tile.     |

Then, one time for each frame, the frame loop calls `flush`. `flush` applies all the recorded changes:

1. If the order changed, it puts the layer containers again in the order of the drawing.
2. It updates the properties of the layers that changed (`syncProps`).
3. It updates the tiles that changed (`syncTile`).

```ts
// src/lib/app/ui/canvas/CanvasView.svelte
pixi.ticker.add((ticker) => {
  showPointer(performance.now());
  painter?.flush();
  view?.flush();
  // ...
});
```

The painter paints first (see [Brush engine](../../painting/brush-engine/)), then the view shows the result. PixiJS then draws the frame.

### Update a tile

`LayerView.syncTile` reads the tile from the layer:

- If the tile is empty and a sprite exists, it destroys the sprite and its texture.
- If the tile exists and a sprite exists, it uploads the new pixels.
- If the tile exists and no sprite exists, it makes a sprite at `(tx × 256, ty × 256)`.

## Optimizations

### One upload for each frame

A brush stroke can change the same tile many times in one frame. The view records the tile one time only, and uploads it one time in `flush`. If the screen shows 60 frames each second, a tile has a maximum of 60 uploads each second, at any speed of the pen.

### Partial uploads

During a stroke, a change also gives the area that changed in each tile. If the view gets two changes for the same tile in one frame, it keeps the union of the two areas. If one of the changes has no area, the full tile must change (`null`).

Then `syncTile` uploads only the rows of this area:

```ts
// src/lib/render/layer-view.ts
if (area) {
  source.update(area.y * TILE_SIZE, (area.y + area.height) * TILE_SIZE);
}
```

The values are positions in texels (one texel is one pixel of the texture). PixiJS uploads only this range. A thin stroke across a tile uploads a few rows, not 256 rows.

### Culling

Each tile sprite has `cullable = true`. `CanvasView.svelte` adds the `CullerPlugin` of PixiJS. Before each frame, this plugin skips the sprites that are outside the screen. When you zoom in on a large canvas, the GPU draws only the visible tiles.

### Scale mode

When the GPU shows a texture larger or smaller than its size, it must calculate the color of each screen pixel. There are two modes:

- **Linear**: it mixes the four nearest texels. The image is smooth. This is correct when you zoom out.
- **Nearest**: it takes the nearest texel only. Each pixel of the drawing shows as a sharp square. This is correct for pixel art when you zoom in.

The view uses `nearest` from zoom 1 (`NEAREST_FROM_ZOOM`), and `linear` below. When the mode changes, `LayerView.setScaleMode` changes it on each texture. PixiJS does not see this change on a texture that it used before, so the code calls `source.style.update()`.

### The checkerboard

The checkerboard is a `TilingSprite`: one small texture, repeated over the canvas. The texture has 2 × 2 texels only, one texel for each square. The view scales it so that each square is 16 pixels of the drawing (`CHECKER_SIZE`).

When the squares are smaller than 6 screen pixels, they make a moiré pattern. Thus, `setCamera` multiplies the square size by 2 until the squares are large enough on the screen.

## Resize preview

When the user changes the canvas size, `setResizePreview` shows the result before the change:

- The checkerboard covers the new canvas area.
- A mask (`previewMask`) cuts the layers to the new area.
- `layersRoot` gets a scale, if the image is scaled.
- The grids and the selection are hidden, because they are for the current size.

The drawing does not change. When the preview stops, the view shows the drawing as it is.

## Limits

- The view only reads the drawing. All changes must go through the drawing and its notifications.
- Each tile has its own texture. A very large canvas with many full tiles uses much GPU memory.
- `flush` must come before PixiJS draws the frame. If not, the screen shows the last frame.
