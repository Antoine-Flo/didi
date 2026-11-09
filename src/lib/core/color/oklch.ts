// OKLCH (Björn Ottosson's Oklab, in polar form): lightness as the eye sees it, chroma and
// hue. Changing the lightness keeps the hue, unlike HSV (a darker yellow stays yellow).
// https://bottosson.github.io/posts/oklab/

import type { RGB } from "#lib/core/color/color.js";

/** Lightness 0-1, chroma 0 to about 0.37 in sRGB, hue 0-360 degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const fromLinear = (x: number) =>
  255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export function rgbToOklch([r8, g8, b8]: RGB): Oklch {
  const [r, g, b] = [toLinear(r8), toLinear(g8), toLinear(b8)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: (h + 360) % 360 };
}

/** Linear sRGB, unclamped: outside 0-1 when the color is out of the sRGB gamut. */
function toLinearRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const angle = (h * Math.PI) / 180;
  const A = c * Math.cos(angle);
  const B = c * Math.sin(angle);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPSILON = 1e-4;
const inGamut = (rgb: number[]) => rgb.every((x) => x >= -EPSILON && x <= 1 + EPSILON);

/**
 * The sRGB color. Out of the gamut, the chroma is lowered until it fits: the lightness and
 * the hue are kept.
 */
export function oklchToRgb(color: Oklch): RGB {
  const l = Math.min(1, Math.max(0, color.l));
  let linear = toLinearRgb({ ...color, l });
  if (!inGamut(linear)) {
    let low = 0;
    let high = color.c;
    for (let i = 0; i < 20; i++) {
      const c = (low + high) / 2;
      if (inGamut(toLinearRgb({ l, c, h: color.h }))) {
        low = c;
      } else {
        high = c;
      }
    }
    linear = toLinearRgb({ l, c: low, h: color.h });
  }
  return linear.map((x) => Math.round(Math.min(255, Math.max(0, fromLinear(x))))) as RGB;
}
