// Shades around a color, for the shade bars of the color panel (like Krita's minimal shade
// selector): each bar varies one thing, the base color in the middle, a little less on the
// left, a little more on the right. Computed in OKLCH: a lighter or darker shade keeps its
// hue, a more or less saturated one its lightness.

import type { RGB } from "./color";
import { oklchToRgb, rgbToOklch } from "./oklch";

export type ShadeKind = "hue" | "chroma" | "lightness";
export const SHADE_KINDS: readonly ShadeKind[] = ["hue", "chroma", "lightness"];

/** How far each bar goes from the middle to an end. */
const HUE_RANGE = 45;
const CHROMA_RANGE = 0.12;
const LIGHTNESS_RANGE = 0.35;
/** Below this chroma, a gray: its hue means nothing, more saturation would invent one. */
const GRAY_CHROMA = 0.002;

/** The shade of `base` at `t`, from -1 (left end) to 1 (right end); 0 is `base`. */
export function shade(base: RGB, kind: ShadeKind, t: number): RGB {
  if (t === 0) {
    return base;
  }
  const { l, c, h } = rgbToOklch(base);
  if (c < GRAY_CHROMA && kind !== "lightness") {
    return base;
  }
  switch (kind) {
    case "hue":
      return oklchToRgb({ l, c, h: (h + HUE_RANGE * t + 360) % 360 });
    case "chroma":
      return oklchToRgb({ l, c: Math.max(0, c + CHROMA_RANGE * t), h });
    case "lightness":
      return oklchToRgb({ l: Math.min(1, Math.max(0, l + LIGHTNESS_RANGE * t)), c, h });
  }
}
