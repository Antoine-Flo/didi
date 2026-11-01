// Drawing tools and their settings.

import { bundledBrush } from "$lib/mypaint/brushes";

export type ToolId = "brush" | "eraser" | "pixel" | "picker";

export type RGB = [number, number, number];

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

export function toHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
