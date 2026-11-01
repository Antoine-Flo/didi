// Drawing tools and their settings.

import type { RGB } from "#lib/core/color/color.js";
import { bundledBrush } from "#lib/mypaint/brushes.js";

export type ToolId = "brush" | "eraser" | "pixel" | "picker";

export const TOOLS: { id: ToolId; title: string }[] = [
  { id: "brush", title: "Brush" },
  { id: "eraser", title: "Eraser" },
  { id: "pixel", title: "Pixel brush" },
  { id: "picker", title: "Color picker" },
];

export interface ToolOptions {
  /** Straight RGB, 0-255. */
  color: RGB;
  brush: {
    /** Bundled MyPaint brush id (see $lib/mypaint/brushes). */
    preset: string;
    /** Diameter in canvas pixels. */
    size: number;
    /** Multiplies the brush's own opacity, 0 to 1. */
    opacity: number;
  };
  eraser: {
    preset: string;
    size: number;
    opacity: number;
  };
  pixel: {
    /** Diameter in whole pixels. */
    size: number;
    opacity: number;
    /** Removes "L" corners (only with a 1-pixel brush). */
    pixelPerfect: boolean;
  };
}

export function defaultToolOptions(): ToolOptions {
  return {
    color: [20, 20, 20],
    brush: {
      preset: "deevad/basic_digital_brush",
      size: bundledBrush("deevad/basic_digital_brush").nativeSize,
      opacity: 1,
    },
    eraser: {
      preset: "deevad/large_hard_eraser",
      size: bundledBrush("deevad/large_hard_eraser").nativeSize,
      opacity: 1,
    },
    pixel: { size: 1, opacity: 1, pixelPerfect: true },
  };
}

export const MIN_SIZE = 0.5;
export const MAX_SIZE = 1000;

/**
 * Size sliders are logarithmic, so small sizes stay easy to set: slider position 0 to 1
 * maps to MIN_SIZE to MAX_SIZE.
 */
export function sizeFromSlider(position: number): number {
  const size = MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, position);
  return size < 10 ? Math.round(size * 10) / 10 : Math.round(size);
}

export function sliderFromSize(size: number): number {
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
  return Math.log(clamped / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE);
}

export const MAX_PIXEL_SIZE = 64;

/**
 * Grows (`direction` 1) or shrinks (-1) the size of a tool, by steps that feel even at
 * every size. The pixel tool grows one pixel at a time. Returns false if it has no size.
 */
export function stepToolSize(options: ToolOptions, tool: ToolId, direction: 1 | -1): boolean {
  // Through the slider mapping, which also rounds sensibly for small and large sizes.
  const scale = (v: number) => sizeFromSlider(sliderFromSize(v * (direction > 0 ? 1.25 : 0.8)));
  if (tool === "brush") options.brush.size = scale(options.brush.size);
  else if (tool === "eraser") options.eraser.size = scale(options.eraser.size);
  else if (tool === "pixel") {
    options.pixel.size = Math.min(MAX_PIXEL_SIZE, Math.max(1, options.pixel.size + direction));
  } else return false;
  return true;
}
