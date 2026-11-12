---
title: Brushes and sizes
description: The brush files, the brush sets of the tools, the real size of a brush, and the comparison with MyPaint.
sidebar:
  order: 3
---

## Purpose

Didi includes all the MyPaint brushes. This page tells how the code reads a brush file, how it puts the brushes in sets for the tools, how it finds the real size of each brush, and how it compares its result with MyPaint.

## Files

| File                                    | Purpose                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/mypaint/myb.ts`                | Reads and checks a `.myb` file.                                    |
| `src/lib/mypaint/brush.ts`              | Sends the settings of a `.myb` file to libmypaint.                 |
| `src/lib/mypaint/brushes/`              | The `.myb` files, one folder for each pack.                        |
| `src/lib/mypaint/brushes.ts`            | The list of the included brushes (`BUNDLED_BRUSHES`).              |
| `src/lib/mypaint/brush-sets.ts`         | One set of brushes for each Painting tool.                         |
| `src/lib/mypaint/brush-size.ts`         | Measures the real size of a brush with test strokes.               |
| `src/lib/mypaint/data/brush-sizes.json` | The measured sizes.                                                |
| `src/lib/mypaint/brush-sizes.test.ts`   | Runs the measure, or checks that each brush has a size.            |
| `src/lib/mypaint/reference.test.ts`     | Compares the strokes of Didi with the strokes of MyPaint.          |
| `tools/brush-compare/mypaint_render.py` | Paints the same strokes with the MyPaint code, for the comparison. |
| `static/brushes/`                       | One preview image for each brush.                                  |

## Concepts

### Settings, inputs and curves

A brush has about 60 **settings**: radius, opacity, hardness, dabs per radius, smudge, color, and more. Each setting has a **base value**.

An **input** is a value that changes during the stroke: pressure, speed, tilt, direction, random, stroke length, and more. For each setting, a brush can have a **curve** for some inputs. A curve is a list of points `(x, y)`: for the input value x, it adds y to the setting.

For example, `tanda/charcoal-03` makes its radius larger with the pressure:

```json
"radius_logarithmic": {
  "base_value": 0.2,
  "inputs": { "pressure": [[0.0, 0.0], [1.0, 0.5]] }
}
```

At full pressure, libmypaint adds 0.5 to the logarithm of the radius. Thus, the radius is multiplied by e^0.5, about 1.65.

### The .myb file

A `.myb` file (version 3) is JSON. It has one object for each setting, with `base_value` and `inputs`. `parseMyb` reads it and checks it: version 3, a number for each base value, and two numbers for each curve point. It throws an error if the file is not valid.

## How it works

### Load a brush into libmypaint

`Brush.load` sends a `.myb` file to libmypaint:

1. It sets all the settings to their default values (`mypaint_brush_from_defaults`).
2. For each setting of the file, it sets the base value.
3. It removes all the curves of this setting: one call for each input that libmypaint knows (`INPUTS`). The file lists all the curves of a setting, so the other curves must be empty.
4. It sends each curve of the file, point by point.

Settings and inputs that libmypaint does not know are ignored (`settingId` gives −1). Thus, a newer brush file still loads.

### The list of brushes

`brushes.ts` finds the brush files with `import.meta.glob`. Vite reads all the `.myb` files at build time, and puts their text in the code:

```ts
// src/lib/mypaint/brushes.ts
const files = import.meta.glob("./brushes/*/*.myb", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
```

There is no file to load when the app starts, and no network request. For each file, the code makes a `BundledBrush`:

| Field        | Value                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| `id`         | `pack/name`, for example `deevad/2B_pencil`.                                        |
| `name`       | The file name, with spaces: `2B pencil`.                                            |
| `eraser`     | `true` if the `eraser` setting is more than 0.5.                                    |
| `sizeFactor` | The largest painted diameter, relative to the base diameter (see below).            |
| `nativeSize` | The diameter that the brush has in its file, at the pressure that makes it largest. |

### Brush sets

`BRUSH_SETS` puts the brushes in sets: one set for each Painting tool (`pencil`, `ink`, `brush`, `eraser`…). The id of a set is also the id of its tool.

Each set has two lists:

- `picks`: the best brushes for the tool, the best first. The first one is the default brush of the tool.
- `more`: the other brushes of the same kind.

Each brush is in one set only. The erasers are only in the eraser set. `setOfBrush` finds the set of a brush. `setBrushes` gives the `BundledBrush` objects of a set.

### Pigment and normal mixing

libmypaint has two ways to mix the brush color with the canvas (`paint_mode`):

- **Normal** (0): it mixes the red, green and blue values. Blue and yellow give gray.
- **Pigment** (1): it converts each color to a spectrum, and mixes the spectra like real paint. Blue and yellow give green. This is slower.

A brush file can have its own value. The tool keeps it, or sets 0 for a tool without pigment (the airbrush):

```ts
// src/lib/app/tools/mypaint-tools.ts
const own = bundledBrush(settings.preset).myb.settings.paint_mode?.base_value ?? 1;
brush.set("paint_mode", pigment ? own : 0);
```

## The real size of a brush

### The problem

The user sets the size of the brush in pixels. The cursor shows a circle of this size. Thus, the brush must paint at this size, at full pressure.

The radius in the file is not this size. Many brushes change their radius with the pressure. Some brushes put their dabs at random positions around the pen, so the stroke is wider than one dab. Some inputs follow the pressure with a delay, or change with the speed.

### The estimate from the curves

`curvesSizeFactor` reads the pressure curve of the radius only. It takes the largest y value, and gives `e^y`. This is fast, but it does not see the random offsets, the speed or the other inputs.

### The measure

`measureSizeFactor` paints test strokes with the real engine, and measures them. For each brush:

1. It makes a drawing with black and white stripes, 2 pixels wide, across the stroke. Smudge and erasers change stripes, so their strokes are visible too.
2. It paints a stroke with a base diameter of 20 pixels. The stroke has 240 samples at 1/120 s, so 2 s. Thus, the slow inputs have time to follow. The pressure goes from 0 to 1 during the first two thirds, and stays at 1.
3. At each step along the stroke, it finds the first and the last pixel that changed by more than 16 (out of 255). The difference is the painted width at this step.
4. It sorts the widths and takes the value at 90 %. A few random dabs far from the stroke do not change the result.
5. It divides this width by 20.

It paints two strokes: one across and one down. A flat brush paints wider in one direction. The factor is the larger of the two.

A very light brush can leave almost no mark, and the measure is too small. Thus, the result is never less than half of the estimate from the curves.

### Where the measure runs

The measure is slow: it paints with all the brushes. Thus, it does not run when the app starts:

- `npm run measure:brushes` runs it for each brush, and writes `src/lib/mypaint/data/brush-sizes.json`.
- `brushes.ts` reads this file at build time. A brush that is not in the file uses the estimate from the curves.
- The normal test (`brush-sizes.test.ts`) fails if a brush is not in the file. Run the measure again when you add a brush.

The tool then sets the libmypaint size to `user size / sizeFactor`. At full pressure, the brush paints at the user size.

## Comparison with MyPaint

`npm run compare:brushes` checks that Didi paints as MyPaint does. It needs MyPaint installed as a system package, with its Python library in `/usr/lib64/mypaint`. If not, the test does not run.

1. `reference.test.ts` makes a list of test cases: a brush, a color, a size, a background, and the stroke events (time, position, pressure, tilt, zoom, rotation).
2. It writes the cases to a JSON file, and runs `tools/brush-compare/mypaint_render.py`. This script paints each case with the code of MyPaint, and writes the raw pixels.
3. The test paints the same cases with Didi.
4. For each case, it compares the two images pixel by pixel: the largest difference, the mean difference, and the ratio of total opacity ("ink").
5. It writes a sheet with three columns: Didi, MyPaint, and the difference in red: `tools/brush-compare/out/sheet.png`.

The Python script converts the MyPaint 15-bit tiles to 8 bits with the same rounding as Didi. Thus, the comparison shows the differences of the engines, not of the conversion.

## Limits

- Didi reads only the `.myb` files of version 3.
- The brush list is fixed at build time. There is no import of brush files.
- The measured size is correct for the test stroke. A stroke at a different speed can paint a little wider or narrower.
