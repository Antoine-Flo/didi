---
title: Native surface
description: The C part of the brush engine, and how to compile libmypaint to WebAssembly.
sidebar:
  order: 2
---

## Purpose

libmypaint does not keep pixels itself. It paints on a **surface**: an object that gives it tiles when it asks for them. Each program that uses libmypaint gives its own surface. MyPaint, GIMP and Krita have their own surfaces.

Didi's surface is in C, in `native/mypaint/didi-surface.c`. It is compiled with libmypaint into the same WebAssembly module. It keeps the tiles of the current stroke, converts the pixels between 8 bits and 15 bits, and records which tiles changed.

## Files

| File                                         | Purpose                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `native/mypaint/didi-surface.c`              | The surface, and the functions that JavaScript calls (`didi_*`).   |
| `native/mypaint/build.sh`                    | Downloads libmypaint 1.6.1, applies the patches, compiles to Wasm. |
| `native/mypaint/patches/pigment-speed.patch` | A faster pigment mix in libmypaint.                                |
| `native/mypaint/shim/config.h`               | The build configuration, in place of the one from autotools.       |
| `native/mypaint/shim/json.h`                 | An empty stand-in for the json-c library.                          |
| `src/lib/mypaint/wasm/libmypaint.mjs`        | The output: one JavaScript file that contains the Wasm module.     |

## Concepts

### 15-bit fixed point

libmypaint keeps each channel as an integer from 0 to 32768 (`1 << 15`). The value 32768 means 1.0. This is **fixed point**: a fraction kept as an integer, with a fixed scale. Integer operations are fast, and 15 bits give 128 times more steps than 8 bits.

Why 15 bits and not 16? Two values of 15 bits multiplied together fit in 30 bits. Thus, a multiplication never overflows a 32-bit integer.

### Premultiplied RGBA

The libmypaint tiles and the layer tiles are both premultiplied: each color channel is already multiplied by the alpha. Thus, a color channel can never be larger than the alpha. The conversion back to 8 bits must keep this rule, also after the rounding.

### Request and release a tile

When libmypaint paints a dab, it asks the surface for each tile under the dab (`tile_request_start`). The surface gives a pointer to the tile buffer. libmypaint writes into it, then releases it (`tile_request_end`). A request can be **read-only**: smudge reads the colors, but does not write.

## How it works

### The tile table

The surface keeps its tiles in a hash table with **open addressing** and **linear probing**:

- The table is an array of slots. The hash of `(tx, ty)` gives the first slot to look at.
- If this slot has a different tile, the search goes to the next slot, and so on, until it finds the tile or an empty slot.

```c
// native/mypaint/didi-surface.c
static unsigned hash(int tx, int ty) {
  return (unsigned)tx * 73856093u ^ (unsigned)ty * 19349663u;
}
```

The two large prime numbers spread the near coordinates over the full table. The capacity is a power of two. Thus, `hash & (capacity - 1)` gives the slot, which is faster than a division.

When the table is half full, `grow` makes a table two times larger, and puts each tile again in its new slot. A half-empty table keeps the searches short.

### First request of a tile

When libmypaint asks for a tile for the first time:

1. The surface allocates two buffers: the 15-bit tile (`buffer`), and an 8-bit copy of the pixels before the stroke (`before`).
2. It calls JavaScript (`js_load_tile`, which calls `Module.loadTile`). JavaScript fills `before` with the pixels of the layer.
3. It converts `before` to 15 bits, into `buffer`.

The conversion uses a table of 256 values (`to_15_bits`). It calculates the table one time, when the surface is made. Then each conversion is one read in the table:

```c
// native/mypaint/didi-surface.c: round(v * 32768 / 255)
for (int v = 0; v < 256; v++) to_15_bits[v] = (uint16_t)((v * 2 * ONE + 255) / 510);
```

This formula rounds with integers only. `(2a + b) / 2b` is the same as `a / b + 0.5`, rounded down. It never has an exact `.5` case, so all compilers give the same result.

### The dirty list

If the request is not read-only, the surface marks the tile as **dirty** (written) and adds its index to a list. A tile goes in the list only one time, even if libmypaint writes into it many times.

`didi_surface_take_dirty` gives the coordinates of the dirty tiles to JavaScript and empties the list. JavaScript gives a buffer for a maximum of 4096 tiles. If there are more, it calls the function again.

### Copy back

`didi_surface_copy_back` converts a dirty tile back to 8 bits. For each pixel and each channel, it mixes the value before the stroke and the brush result by the stroke opacity:

```
value = round(before + (brush × 255 / 32768 − before) × opacity)
```

Then it makes sure that each color channel is not larger than the alpha. The rounding of each channel is separate, so a color could be one step above the alpha. A premultiplied color above its alpha is not valid.

The surface keeps `before` for all the stroke. Thus, the opacity always mixes with the pixels before the stroke, not with the result of the last flush. A stroke at 50 % gives 50 %, also where the pen goes on the same place many times.

### Move the brush

`didi_stroke_to` is the function that JavaScript calls for each sample. It opens an atomic operation on the surface, calls `mypaint_brush_stroke_to_2` with the sample and the view (zoom, rotation), and closes the operation. libmypaint paints all the dabs of the movement between these two calls.

### Random seed

libmypaint uses `rand()` from C to select the pixels that smudge reads. `didi_seed` sets the seed of `rand()`. The stroke calls it with 1 at the start. Thus, the same stroke on the same pixels gives the same result.

## Build

`native/mypaint/build.sh` builds the module. It needs Emscripten (`emcc`). Run it only when you change a file in `native/mypaint/`: the output is in git.

The script does these steps:

1. Downloads the libmypaint 1.6.1 release into a cache folder, and checks its SHA-256 sum.
2. Copies the source and applies the patches of `patches/`.
3. Puts `shim/config.h` in place of the `config.h` of autotools.
4. Compiles the C files of libmypaint and `didi-surface.c` with `emcc -O3 -msimd128`.

The important Emscripten options are:

| Option                      | Effect                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `-msimd128`                 | Lets the compiler use WebAssembly SIMD: one operation on 4 values at a time. The dab loops are faster. |
| `-sMODULARIZE -sEXPORT_ES6` | The output is an ES module with one function, `createLibMyPaint`.                                      |
| `-sSINGLE_FILE`             | The Wasm binary is in the `.mjs` file. There is no second file to load.                                |
| `-sALLOW_MEMORY_GROWTH`     | The memory can grow when a stroke uses many tiles.                                                     |
| `-sENVIRONMENT=web,node`    | The module runs in the browser and in Node (for the tests).                                            |
| `-sEXPORTED_FUNCTIONS`      | The C functions that JavaScript can call. All other functions are removed.                             |

### The shims

libmypaint can read `.myb` files with the json-c library. Didi reads these files in TypeScript (see [Brushes and sizes](../brushes-and-sizes/)) and sends each setting with `mypaint_brush_set_base_value` and `mypaint_brush_set_mapping_*`. Thus, json-c is not necessary. `shim/json.h` only lets `mypaint-brush.c` compile. Its parse function always fails.

`shim/config.h` disables glib and gettext. The build is plain C.

### The pigment patch

The pigment mode mixes colors with a **weighted geometric mean** of their spectra: `a^fa × b^fb`, for each wavelength. Powers are slow. The patch calculates the same value as `2^(fa × log2(a) + fb × log2(b))`, for 4 wavelengths at a time.

It also keeps values that do not change:

- The logarithms of the dab color, one time for each dab.
- The logarithms of a canvas pixel, again only when the pixel has a different color from the last one.
- The full result, while the color and the weight do not change. Under a hard brush, on a flat area, many pixels have the same color.

The result is the same as without the patch, except for small differences from the fast approximations.

## Limits

- The surface has the tiles of one stroke only. `didi_surface_clear` frees all the tiles before each stroke.
- The surface never frees a tile during a stroke. A very long stroke over a large canvas uses much memory.
- To change the C code, you need Emscripten. The script stops if `emcc` is not found.
