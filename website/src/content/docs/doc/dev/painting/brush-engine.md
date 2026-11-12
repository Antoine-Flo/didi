---
title: Brush engine
description: How a brush stroke goes from the pen to the layer.
sidebar:
  order: 1
---

## Purpose

The brush engine paints the strokes of the Painting tools: pencil, ink, brush, watercolor, airbrush, blend, texture and eraser. Didi uses libmypaint, the brush engine of MyPaint, compiled to WebAssembly. The brushes are the MyPaint brushes, and they paint as in MyPaint.

This page tells how a stroke goes from the pen to the layer. The next pages tell about the C part of the engine ([Native surface](../native-surface/)) and about the brushes ([Brushes and sizes](../brushes-and-sizes/)).

## Files

| File                                  | Purpose                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/mypaint/engine.ts`           | Loads libmypaint. Holds the surface where the strokes paint.       |
| `src/lib/mypaint/brush.ts`            | One brush: its settings, its size, its color.                      |
| `src/lib/mypaint/stroke.ts`           | One stroke on a layer, from the start to the undo step.            |
| `src/lib/app/tools/mypaint-tools.ts`  | The Painting tools. They send the pen samples to the stroke.       |
| `src/lib/app/input/painter.ts`        | Calls the tool stroke one time for each frame, with a time budget. |
| `src/lib/mypaint/wasm/libmypaint.mjs` | libmypaint, compiled. This file is in git.                         |

## Concepts

### Dabs

libmypaint does not draw lines. It draws **dabs**: small round marks, one after the other, along the movement of the pen. A dab has a position, a radius, a color, an opacity and a hardness. When the dabs are near each other, they look like a continuous line.

The brush settings tell how many dabs to put, and how each dab changes with the **inputs**: pressure, speed, tilt, direction, random values. For example, a pencil can make its dabs larger and darker when the pressure increases.

### Smudge

Some brushes take color from the canvas and mix it with their own color. This is **smudge**. Before each dab, the brush reads the colors under it, and keeps a mix of them. The next dab paints with this mix. Thus, the brush pulls the colors along the stroke, like wet paint.

### WebAssembly and its memory

WebAssembly (Wasm) is a binary format that the browser runs nearly as fast as native code. libmypaint is written in C. Emscripten compiles it to Wasm (see [Native surface](../native-surface/)).

A Wasm module has its own memory: one large array of bytes. The C code sees this array as its memory, and a C pointer is only an index in this array. JavaScript can read and write the same array through typed arrays:

- `HEAPU8`: the memory as bytes (`Uint8Array`).
- `HEAP32`: the memory as 32-bit integers (`Int32Array`). The index is the byte address divided by 4.

JavaScript calls the C functions with numbers only. To give a string or a buffer to C, JavaScript must put it in the Wasm memory first (`_malloc`, `stringToNewUTF8`) and give its address.

```ts
// src/lib/mypaint/engine.ts: read the tile list that C wrote at dirtyBuffer
const base = this.dirtyBuffer >> 2; // byte address → index in HEAP32
for (let i = 0; i < n; i++) {
  tiles.push([this.mod.HEAP32[base + 2 * i], this.mod.HEAP32[base + 2 * i + 1]]);
}
```

The memory can grow (`ALLOW_MEMORY_GROWTH`). When it grows, the old typed arrays become invalid. Thus, the code reads `mod.HEAPU8` again at each use, and it does not keep it in a variable.

### Two sizes of tiles

A layer keeps its pixels in tiles of 256 × 256 pixels, with 8 bits for each channel (`TILE_SIZE` in `core/document/tiles.ts`).

libmypaint paints in its own tiles of 64 × 64 pixels, with 15 bits for each channel (`MP_TILE` in `engine.ts`). The 15 bits keep the quality of the colors when the brush mixes them many times (smudge). With 8 bits, each mix rounds the color, and after many dabs the colors become dirty.

One layer tile contains 4 × 4 = 16 libmypaint tiles. The stroke copies the pixels between the two types of tiles.

## How it works

### 1. Load the engine

`loadMyPaint()` loads the Wasm module one time only, and keeps the promise. The editor calls it at the start (`app/state/editor-state.svelte.ts`).

The `MyPaint` object makes one surface, and two buffers in the Wasm memory: one for the list of changed tiles, and one for a tile converted back to 8 bits. The engine has one surface only. Thus, only one stroke can paint at a time.

libmypaint finds a setting by its name (for example `"radius_logarithmic"`). The name must go into the Wasm memory, so the search is slow. `settingId` and `inputId` keep the results in a `Map`.

### 2. Prepare the brush

When the pen touches the canvas, the tool (`QueuedStroke` in `mypaint-tools.ts`) prepares the brush:

1. It gets the libmypaint brush of the preset. The painter (`painter.ts`) makes this brush at the first use of the preset, from its `.myb` file, and keeps it for the next strokes.
2. It sets the paint mode: pigment or normal (see [Brushes and sizes](../brushes-and-sizes/)).
3. It sets the size. The user sets the diameter at full pressure. The tool divides this size by the `sizeFactor` of the brush.
4. It sets the color. libmypaint uses hue, saturation and value (HSV). `setColor` converts the RGB color with `rgbToHsv`.

libmypaint keeps the radius as a logarithm (`radius_logarithmic`). Thus, the curves can multiply the radius: libmypaint adds the curve values to the logarithm.

```ts
// src/lib/mypaint/brush.ts
set size(diameter: number) {
  this.set("radius_logarithmic", Math.log(Math.max(0.2, diameter) / 2));
}
```

### 3. Start the stroke

The tool makes a `MyPaintStroke`. The constructor:

1. Makes sure that the layer is not locked, and that the opacity is between 0 and 1.
2. Makes sure that no other stroke is in progress (`mp.current`).
3. Clears the surface.
4. Sets the random seed to 1 (`_didi_seed`). Smudge reads random pixels. With the same seed, the same stroke gives the same pixels each time. The tests need this.
5. Resets the brush. Thus, the stroke does not start with a line from the end of the last stroke.

Then the tool calls `moveTo` at the first point. `moveTo` sends the point with no pressure and a long time (10 s). libmypaint sees a new start, and puts the brush there without paint.

### 4. Send the samples

For each pen sample, the tool calls `strokeTo` with the position, the pressure, the tilt and the time since the last sample (`dtime`, in seconds).

libmypaint calculates the speed from the distance and the time. The pen events often have a resolution of 1 ms, so two events can have the same time. With `dtime = 0`, the speed is infinite. Thus, `QueuedStroke.queue` keeps the samples with the same time. When a sample with a later time comes, it spreads their times evenly in the interval:

```ts
// src/lib/app/tools/mypaint-tools.ts
const interval = Math.min(s.time - this.lastTime, 100);
const step = interval / (this.sameTime.length + 1);
let time = s.time - interval;
for (const waiting of this.sameTime) {
  this.send(waiting, (time += step));
}
```

libmypaint also gets the zoom and the rotation of the view (`stroke.view`). It measures the speed in screen pixels, as MyPaint does. Thus, a brush that changes with the speed gives the same result on the screen at all zooms.

### 5. Load the tiles

When libmypaint needs a tile for the first time in the stroke, the C surface calls JavaScript (`Module.loadTile`). `MyPaintStroke.loadTile` copies the pixels of the layer into the libmypaint tile, as they were before the stroke.

The layer tile has 256 pixels on each row, and the libmypaint tile has 64. Thus, the copy goes row by row, from the correct position in the layer tile. Outside the canvas, the tile is transparent.

### 6. Show the stroke

The painter calls `flush` one time for each frame. `flush`:

1. Gets the list of the libmypaint tiles that changed since the last flush (`takeDirty`).
2. For each tile, gets its pixels back in 8 bits, mixed with the pixels before the stroke by the stroke opacity (`copyBack`, in C).
3. Copies the result into a **working tile**: a copy of the layer tile for this stroke. It obeys the selection and the alpha lock (see below).
4. Puts the working tiles in the layer, and tells which areas changed (`drawing.showStrokeTiles`). The view then uploads only these areas to the GPU (see [Drawing view](../../render/drawing-view/)).

The first time that the stroke changes a layer tile, it keeps a copy of this tile as it was before (`original`). The undo step needs it.

### 7. End the stroke

When the pen goes up, the tool calls `finish`:

1. It sends the last samples that wait.
2. If the pen moved less than 1 pixel, it calls `tap` (see below).
3. `MyPaintStroke.finish` does a last `flush`.
4. It removes the layer tiles that are now fully transparent (an eraser removed all their pixels). Thus, the layer stays sparse.
5. It gives one undo step (`replaceTiles`) with the tiles before and after the stroke. If the stroke changed nothing, it gives `null`.

`cancel` stops the stroke and puts the original tiles back in the layer.

## Special cases

### A tap

libmypaint puts dabs only along a movement. A tap without movement gives no dab. `tap` sets the brush to put dabs over time for a short period: 200 dabs each second (`dabs_per_second`), for 30 ms, so about 6 dabs.

libmypaint needs two calls to apply the new rate to its state. Thus, `tap` sends the point three times: two very short calls, then a call of 30 ms that puts the dabs. Then it sets the old rate again.

### Stroke opacity

The stroke opacity (0 to 1) applies to the full stroke, not to each dab. If each dab had the opacity, the dabs would add their opacity where they overlap, and the stroke would be darker where it is dense.

The stroke paints at full opacity on the surface. Then, at the copy back, each pixel is mixed between its value before the stroke and the result of the brush. This is the same for all brushes and for the erasers.

### Selection

The stroke gets a `StrokeClip`: a rectangle (`clip`), and a mask in this rectangle (`clipMask`, one byte for each pixel). The brush paints on its own surface also outside the selection, like on a stencil. But `copyBack` copies only the pixels in the rectangle, where the mask is 1.

### Alpha lock

When the layer has its alpha locked, each pixel must keep its opacity. After the copy, `keepAlpha` (in `core/document/pixels.ts`) gives back to each pixel the alpha that it had before the stroke. It keeps the new color: the color values are premultiplied, so it multiplies them by `old alpha / new alpha`. A pixel that was transparent stays transparent. A pixel that the eraser removed fully keeps its old color.

## Optimizations

### A time budget for each frame

A large brush that moves fast can need many milliseconds for each sample. If the code painted all the samples immediately, the interface would stop.

`QueuedStroke.move` does not paint. It only adds the sample to a queue (`pending`). Then, one time for each frame, `flush(budgetMs)` paints samples from the queue until the budget is used (8 ms by default, in `painter.ts`). A sample that is not painted waits for the next frame. Thus, a very large brush is behind the pen, but the interface does not stop.

### Cut long segments

The time for one sample is about its length × the brush size. A single long, fast segment with a large brush can need more than the full budget. `move` cuts such a segment into shorter parts, with interpolated samples (`between`):

```ts
// src/lib/app/tools/mypaint-tools.ts
const parts = Math.ceil((length * this.size) / MAX_SEGMENT_COST);
```

`MAX_SEGMENT_COST` is 4000, about 4 ms on a fast computer.

### Copy only the changed tiles

`flush` copies back only the libmypaint tiles that libmypaint wrote since the last flush. It does not copy the full stroke each frame. It also sends to the view only the area of each layer tile that changed.

### Pigment mode

The pigment mode mixes colors like real paint (spectral mixing). It is much slower where the layer already has color. The airbrush puts many large, light dabs, and its result in pigment mode is nearly the same. Thus, the airbrush uses the normal mode (`pigment = false`).

## Limits

- Only one stroke can paint at a time, because the engine has one surface.
- The speed dynamics change with the zoom, because libmypaint measures the speed on the screen.
- A very large brush can be behind the pen. This is the result of the time budget.
- The compiled engine (`src/lib/mypaint/wasm/libmypaint.mjs`) is in git. You compile it again only when you change `native/mypaint/`.
