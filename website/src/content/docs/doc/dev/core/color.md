---
title: Colors
description: RGB and HSV, and the conversions between them.
sidebar:
  order: 20
---

## Purpose

The `core/color` module holds the color types and the conversions between color models. The color panel uses them: the square, the wheel and the hex field.

## Files

| File                          | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `src/lib/core/color/color.ts` | The `RGB` and `HSV` types. Hex text. RGB ↔ HSV. |

## Concepts

### Straight RGB

A color is three numbers from 0 to 255: red, green, blue (`RGB` in `color.ts`). These values are **straight**: they do not include the opacity.

The layers keep their pixels **premultiplied**: each channel is already multiplied by the alpha. The color module never sees premultiplied values. The conversion is in `core/document/pixels.ts`.

### HSV

HSV is a different way to write the same RGB color:

- **Hue** (0–360°): the position on the color wheel. 0 is red, 120 is green, 240 is blue.
- **Saturation** (0–1): 0 is gray, 1 is the pure color.
- **Value** (0–1): 0 is black, 1 is the brightest color.

HSV is easy to compute and easy to show as a square or a wheel. But HSV does not follow the eye. A yellow and a blue with the same value do not look equally bright.

## Limits

- Colors have 8 bits for each channel. There is no wide gamut (Display P3) color.
- `fromHex` reads only the 6-digit form (`#rrggbb`). It does not read `#rgb` or an alpha value.
