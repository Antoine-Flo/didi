---
title: Colors
description: RGB, HSV and OKLCH, the color wheel triangle and the shade bars.
sidebar:
  order: 20
---

## Purpose

The `core/color` module holds the color types and the conversions between color models. The color panel uses them: the wheel, the triangle, the shade bars and the hex field.

## Files

| File                                   | Purpose                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| `src/lib/core/color/color.ts`          | The `RGB` and `HSV` types. Hex text. RGB ↔ HSV.         |
| `src/lib/core/color/oklch.ts`          | RGB ↔ OKLCH, with a gamut limit.                        |
| `src/lib/core/color/shades.ts`         | The colors of the shade bars, around a base color.      |
| `src/lib/core/color/color-triangle.ts` | The triangle of the color wheel: draw it, read a point. |

## Concepts

### Straight RGB

A color is three numbers from 0 to 255: red, green, blue (`RGB` in `color.ts`). These values are **straight**: they do not include the opacity.

The layers keep their pixels **premultiplied**: each channel is already multiplied by the alpha. The color module never sees premultiplied values. The conversion is in `core/document/pixels.ts`.

### HSV

HSV is a different way to write the same RGB color:

- **Hue** (0–360°): the position on the color wheel. 0 is red, 120 is green, 240 is blue.
- **Saturation** (0–1): 0 is gray, 1 is the pure color.
- **Value** (0–1): 0 is black, 1 is the brightest color.

HSV is easy to compute and easy to show as a wheel and a triangle. But HSV does not follow the eye. A yellow and a blue with the same value do not look equally bright.

### OKLCH

OKLCH is the polar form of **Oklab**, a color space by Björn Ottosson. It has three values:

- **L** (lightness, 0–1): the brightness as the eye sees it.
- **C** (chroma, 0 to about 0.37): the quantity of color. 0 is gray.
- **H** (hue, 0–360°).

In OKLCH, a change of lightness keeps the hue. A darker yellow stays yellow. In HSV, a darker yellow becomes olive green. Thus, the shade bars use OKLCH.

### Linear light and gamma

An sRGB value is not proportional to the quantity of light. The screen applies a curve (the "gamma"). Before the matrix operations of Oklab, `oklch.ts` removes this curve (`toLinear`). After them, it applies the curve again (`fromLinear`).

```ts
// src/lib/core/color/oklch.ts
const toLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
```

### Gamut

Many OKLCH values have no sRGB color: the screen cannot show them. These values are "out of the gamut". The linear RGB result of such a value has channels below 0 or above 1.

## How it works

### RGB → OKLCH

`rgbToOklch` does these steps:

1. It converts each channel to linear light.
2. It multiplies the linear RGB by a 3 × 3 matrix. The result is the LMS values: the response of the three types of cones of the eye.
3. It takes the cube root of each LMS value. This step makes the space perceptually even.
4. It multiplies by a second matrix. The result is L, a and b (Oklab).
5. It converts a and b to polar form: chroma = `hypot(a, b)`, hue = `atan2(b, a)`.

### OKLCH → RGB, with a gamut limit

`oklchToRgb` does the inverse steps. If the result is out of the gamut, it keeps the lightness and the hue, and it decreases the chroma. It finds the largest chroma in the gamut with a **binary search** (20 steps):

```ts
// src/lib/core/color/oklch.ts
for (let i = 0; i < 20; i++) {
  const c = (low + high) / 2;
  if (inGamut(toLinearRgb({ l, c, h: color.h }))) {
    low = c;
  } else {
    high = c;
  }
}
```

Each step cuts the interval in two. After 20 steps, the error is smaller than one millionth of the start interval. This is much more precise than 8-bit RGB.

### The shade bars

`shade(base, kind, t)` gives one color of a shade bar. `t` goes from −1 (left end) to 1 (right end). 0 is the base color. Each bar changes one OKLCH value only:

| Bar         | Change             |
| ----------- | ------------------ |
| `hue`       | ±45° of hue        |
| `chroma`    | ±0.12 of chroma    |
| `lightness` | ±0.35 of lightness |

A gray has a chroma near 0. Its hue has no meaning. Thus, for a gray (chroma < 0.002), the hue and chroma bars return the base color. If they did not, they would show a random hue.

### The triangle of the wheel

The triangle has three corners: black at the top, white at the bottom left, the pure hue at the bottom right.

The module uses **barycentric coordinates**. Each point in a triangle has three weights, one for each corner. The weights are positive inside the triangle and their sum is 1. For an HSV color:

- weight of the hue corner = s · v
- weight of the white corner = (1 − s) · v
- weight of the black corner = 1 − v

Thus, `trianglePoint(radius, s, v)` mixes the three corner positions with these weights. `triangleColor` does the inverse: it computes the weights of a point, sets the negative weights to 0 (the point is then on the edge), and finds s and v.

The mix of the corner **colors** with these weights gives exactly the HSV color. Thus, the drawn triangle and the selected color always agree.

`paintTriangle` draws the triangle pixel by pixel into an RGBA buffer. Near the edge, it makes the pixels partly transparent (alpha from the distance to the edge). This gives a smooth edge without a second pass.

## Limits

- Colors have 8 bits for each channel. There is no wide gamut (Display P3) color.
- `fromHex` reads only the 6-digit form (`#rrggbb`). It does not read `#rgb` or an alpha value.
