---
title: Tiles and pixels
description: How a layer keeps its pixels in tiles, and the pixel format of Didi.
sidebar:
  order: 1
---

## Purpose

A layer must keep millions of pixels. Most layers are empty in most places. The tile store keeps only the parts of a layer that have pixels. It also makes undo cheap, because it can share tiles instead of copying them.

## Files

| File                              | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `src/lib/core/document/tiles.ts`  | `TileStore`: the pixels of one layer, in tiles.                   |
| `src/lib/core/document/pixels.ts` | Conversions between straight and premultiplied alpha. Alpha lock. |

## Concepts

### The pixel format

Each pixel has 4 bytes: red, green, blue, alpha (RGBA). Each byte is 0 to 255. The pixels go row by row ("row-major"): the first row from left to right, then the second row, and so on.

To find the bytes of the pixel at column `x` and row `y` in an image of width `w`:

```ts
const i = (y * w + x) * 4; // red at i, green at i + 1, blue at i + 2, alpha at i + 3
```

The code uses `Uint8ClampedArray` for pixels. When you write a value above 255 into it, it keeps 255. When you write a value below 0, it keeps 0. It also rounds decimal values.

### Straight alpha and premultiplied alpha

There are two ways to keep a color with transparency:

- **Straight alpha**: the color channels hold the real color. A red pixel at 50 % opacity is `(255, 0, 0, 128)`. PNG files and the browser canvas use this format.
- **Premultiplied alpha**: each color channel is already multiplied by the alpha. The same pixel is `(128, 0, 0, 128)`.

Didi keeps all layer pixels premultiplied. There are three reasons:

1. To mix two pixels, you add them with weights. With premultiplied pixels, this gives the correct result directly. With straight pixels, a transparent pixel with a "hidden" color pollutes the mix.
2. The GPU blends premultiplied pixels with a simple formula.
3. All fully transparent pixels are `(0, 0, 0, 0)`. Thus, the code can find an empty tile with a test of the alpha bytes only.

The rule is: **no color channel is ever above the alpha**. Many functions clamp the colors to the alpha after they round values, to keep this rule.

`premultiply` and `unpremultiply` in `pixels.ts` convert between the two formats. Use them at the edges of the program: when you read or write a PNG, or when you give pixels to the browser.

### Tiles

The store cuts the canvas into squares of 256 × 256 pixels (`TILE_SIZE`). Each square is a tile. A tile has `256 × 256 × 4 = 262 144` bytes.

A tile at column `tx` and row `ty` covers the pixels from `(tx × 256, ty × 256)` to `(tx × 256 + 255, ty × 256 + 255)`. The tiles at the right and bottom edges can go past the canvas. The store ignores the pixels outside the canvas.

### Tile keys

The store keeps the tiles in a `Map`. The key of the map is one number for each tile:

```ts
// src/lib/core/document/tiles.ts
export const tileKey = (tx: number, ty: number) => ty * 65536 + tx;
```

A number key is faster than a string key such as `"3,7"`. The limit is 65 536 tile columns. This is a canvas of 16 million pixels in width, much more than necessary.

### Sparse storage

The store does not keep a fully transparent tile. When a write makes a tile fully transparent, the store removes it from the map. `getTile` then returns `undefined`, which means "all pixels are `(0, 0, 0, 0)`".

Thus, a large empty layer uses almost no memory. Each function that reads tiles must accept `undefined` as an empty tile.

### Tiles do not change

This is the most important rule of the store: **the store never changes a tile array after it stores it**. To write pixels, `writeRegion` copies the old tile (`previous.slice()`), changes the copy, and stores the copy in place of the old tile.

Because of this rule, a snapshot can keep references to the tiles. It does not copy the bytes:

```ts
// src/lib/core/document/tiles.ts
snapshot(keys: Iterable<number>): TileSnapshot {
  const saved: TileSnapshot = new Map();
  for (const key of keys) {
    saved.set(key, this.tiles.get(key));
  }
  return saved;
}
```

A `TileSnapshot` is a map from a tile key to a tile, or to `undefined` for an empty tile. The history, the selection and the canvas edits use snapshots to go back to an old state. The cost of a snapshot is one map entry for each tile, not 256 KB for each tile.

:::caution
`getTile` gives the stored array. Do not change it. If you change it, you also change all the snapshots that share it, and undo will give wrong pixels.
:::

## How it works

### Read a region

`readRegion(rect)` makes a new buffer for the rectangle. For each tile that the rectangle touches (`tilesIn`), it copies the rows that overlap (`copyRows`). It skips the empty tiles: the new buffer is already all zeros.

### Write a region

`writeRegion(rect, data)`:

1. Finds the tiles that the rectangle touches.
2. For each tile, copies the old tile, or makes a new empty tile.
3. Copies the overlapping rows of `data` into it. It ignores the pixels outside the canvas.
4. Stores the tile with `put`. If the tile is fully transparent, `put` removes it.
5. Returns the keys of the changed tiles.

### Copy rows

`copyRows` finds the overlap of the source rectangle, the destination rectangle and a clip rectangle. Then it copies one full row at a time with `TypedArray.set`. A row copy is much faster than a copy of each pixel, because the engine copies the bytes as one block.

### Replace all tiles

`reset(width, height, tiles)` changes the size of the store and replaces all its tiles. The image edits use it (crop, scale, rotate). It returns the old size and the old tiles, so that undo can call `reset` again with them.

## Optimizations

- **Sparse tiles**: empty tiles take no memory and no time.
- **Shared tiles**: snapshots and undo steps share tile arrays.
- **Number keys**: faster map access than string keys.
- **Row copies**: `copyRows` copies full rows, not single pixels.

## Alpha lock

When a layer has the alpha lock, painting changes the color of a pixel but not its opacity. `keepAlpha` in `pixels.ts` does this for one pixel, after the brush paints it:

1. If the pixel was transparent before, it stays transparent.
2. If the brush erased the pixel fully, the pixel gets its old value back.
3. In other cases, the function gives the old alpha back to the pixel. It scales the color channels by `old alpha / new alpha`, because the pixel is premultiplied.

## Limits

- The width of a canvas is limited to 65 536 tiles (see "Tile keys").
- A tile is 256 KB, even when only one pixel in it has a color.
- The store does not know layers or undo. The [drawing](/doc/dev/core/document/) adds these.
