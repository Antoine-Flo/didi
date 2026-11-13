---
title: Drawing and layers
description: "The document model: the canvas, the stack of layers, the change events, and the CPU compositing."
sidebar:
  order: 2
---

## Purpose

The `Drawing` class is the document: a canvas size and a stack of layers. All the other parts of Didi read the drawing. Only the history and the edits change it.

## Files

| File                                       | Purpose                                                             |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `src/lib/core/document/drawing.ts`         | `Drawing`: the canvas size, the layers, the change events.          |
| `src/lib/core/document/layer.ts`           | The settings of a layer (`LayerProps`) and the read-only types.     |
| `src/lib/core/document/compositing.ts`     | Flattens the visible layers into one image, on the CPU.             |
| `src/lib/core/document/layer-thumbnail.ts` | The small preview of a layer, and the rectangle around its content. |

## Concepts

### A layer

A layer is an object with an `id`, some settings and a [tile store](/doc/dev/core/tiles/):

```ts
// src/lib/core/document/layer.ts
export interface LayerProps {
  name: string;
  visible: boolean;
  opacity: number; // 0 to 1
  blendMode: BlendMode; // "normal", "screen" or "add"
  locked: boolean; // refuses pixel changes
  alphaLocked: boolean; // painting keeps the opacity of each pixel
}
```

The `id` (for example `"layer-3"`) never changes. The code uses the id, not the index, to find a layer, because the index changes when a layer moves.

The stack goes from the bottom layer (index 0) to the top layer.

### Read-only access

`drawing.layers` and `drawing.getLayer(id)` give a `ReadonlyLayer`. Its type removes the methods that write pixels (`writeRegion`, `restore`, `reset`). Thus, TypeScript prevents a change of a layer from outside the drawing. Only the methods of `Drawing` can change a layer, and each of them sends an event.

### Each change returns its inverse

Each method that changes the drawing returns the data necessary to undo it:

| Method          | Returns                                | Undo with                     |
| --------------- | -------------------------------------- | ----------------------------- |
| `addLayer`      | nothing                                | `removeLayer(id)`             |
| `removeLayer`   | the layer and its index                | `addLayer(layer, index)`      |
| `moveLayer`     | the old index                          | `moveLayer(id, oldIndex)`     |
| `updateLayer`   | the old values of the changed settings | `updateLayer(id, oldValues)`  |
| `writePixels`   | a snapshot of the tiles before         | `restorePixels(id, snapshot)` |
| `restorePixels` | a snapshot of the tiles before         | `restorePixels(id, snapshot)` |
| `resizeCanvas`  | the old size and all the old tiles     | `resizeCanvas(old)`           |

The drawing does not know the history. The [edits](/doc/dev/core/history/) use these return values to make undo steps.

### Change events

The drawing sends an event after each change. The canvas view and the layer panel subscribe to these events:

```ts
const unsubscribe = drawing.subscribe((change) => {
  if (change.type === "pixels-changed") {
    // change.tiles: the keys of the changed tiles
  }
});
```

The event types are `layer-added`, `layer-removed`, `layer-moved`, `layer-updated`, `pixels-changed` and `canvas-resized`.

A `pixels-changed` event gives the keys of the changed tiles. It can also give `areas`: the changed part of each tile. With this data, the renderer sends only the changed pixels to the GPU, not all the layer.

## How it works

### Make and add a layer

1. `createLayer(props)` makes a layer with a new id and an empty tile store. It does not add the layer.
2. `addLayer(layer, index)` puts the layer in the stack. It makes sure that the id is new and that the size of the layer is the size of the canvas.

There are two steps because an undo step must keep the same layer object. When you redo "Add layer", the history adds the same object again, with the same id and the same pixels.

### Write pixels

`writePixels(id, rect, data)`:

1. Refuses the change if the layer is locked.
2. Takes a snapshot of the tiles in the rectangle.
3. Writes the data into the tile store.
4. Sends `pixels-changed`.
5. Returns the snapshot.

`restorePixels` puts tiles back from a snapshot. It works also on a locked layer, because undo must always work.

### Change the canvas size

`resizeCanvas(content)` replaces the size and the tiles of all the layers at the same time. Crop, scale and rotate use it. It sends `canvas-resized`, because all the pixels can change.

## Compositing on the CPU

`composite(drawing, rect)` in `compositing.ts` flattens the visible layers into one premultiplied image. Export, "merge down" and "flatten" use it. The GPU view uses the same formulas, and the tests compare the two.

The algorithm, for each visible layer from the bottom to the top:

1. Skip the layer if it is hidden or its opacity is 0.
2. For each tile in the rectangle, skip it if it is empty. An empty source does not change the result, in all blend modes.
3. For each pixel with an alpha above 0, blend it over the result (`blendPixel`).

The blend follows the W3C "Compositing and Blending" specification ("source-over"). For premultiplied channels in the range 0 to 1, with `as` and `ab` the alpha of the source and of the backdrop:

```ts
// src/lib/core/document/compositing.ts
ao = as + ab * (1 - as);
// co = cs·(1 − ab) + cb·(1 − as) + as·ab·B(Cb, Cs)
let co = cs * (1 - ab) + cb * (1 - as);
if (ab > 0) {
  co += as * ab * blend(cb / ab, cs / as);
}
```

`B` is the blend function. For "normal", `B` gives the source color. For "screen", `B(cb, cs) = cb + cs − cb × cs`. "add" is a different formula: it adds the two pixels and clamps the sum to 1.

The function rounds each layer to 8 bits after the blend, as a GPU render target does. Thus, the CPU and the GPU give the same pixels.

## Thumbnails

`layerThumbnail` makes the small preview of a layer for the layer panel.

A simple method reads all the pixels of the layer. On a large canvas, this costs too much time. Thus, for each pixel of the preview, the function reads only 3 × 3 samples (`SAMPLES`) in the area that the pixel covers, and averages them. The cost depends on the size of the preview, not on the size of the layer.

The samples are premultiplied. Thus, the sum of the colors is already weighted by the alpha. The function divides the sums by the sum of the alphas to get straight colors, because the preview goes to the browser.

`contentBounds` finds the smallest rectangle around the pixels that are not transparent. It reads only the stored tiles. It also skips a tile if the tile is fully inside the rectangle that it found before: this tile cannot make the rectangle larger.

## Limits

- Only three blend modes: normal, screen and add. Each mode must give the same result on the CPU and on the GPU.
- `getLayer` and `indexOf` throw an error for an unknown id.
- The drawing does not keep the active layer or the selection. The [editor](/doc/dev/core/editor/) keeps them.
