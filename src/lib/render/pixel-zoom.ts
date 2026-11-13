// Zoom levels for pixel art. Zoomed out, a canvas pixel at a zoom like 150 % takes 1 device
// pixel, the next one 2: the drawing looks uneven. So below FREE_FROM device pixels per canvas
// pixel, the zoom keeps to whole levels (1, 2, 3… device pixels, or 1/2, 1/3… below 1). Above,
// one device pixel more or less no longer shows: the zoom is free.
//
// Counted in device pixels, not CSS pixels: on a dense screen (a phone at 3×) the free zone
// starts lower, where the eye no longer sees a device pixel.
//
// Zooms here are camera zooms (CSS pixels per canvas pixel); `dpr` is the device pixel ratio.

import { MAX_ZOOM, MIN_ZOOM } from "#lib/render/camera.js";

/** From this many device pixels per canvas pixel, the zoom is free. */
export const FREE_FROM = 8;

/** Rounding slack: a zoom this close to a level is on it. */
const EPS = 1e-6;

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The level at or below `d` device pixels per canvas pixel. */
function levelAtOrBelow(d: number): number {
  return d >= 1 - EPS ? Math.floor(d + EPS) : 1 / Math.ceil(1 / d - EPS);
}

function levelAbove(level: number): number {
  return level >= 1 ? level + 1 : 1 / (Math.round(1 / level) - 1);
}

function levelBelow(level: number): number {
  return level > 1 ? level - 1 : 1 / (Math.round(1 / level) + 1);
}

/** Whether `zoom` is free (in the zone where it is not snapped). */
export function isFreeZoom(zoom: number, dpr: number): boolean {
  return zoom * dpr >= FREE_FROM - EPS;
}

/** The level at or below `zoom`, or `zoom` if it is free. For fitting: never bigger. */
export function snapZoomDown(zoom: number, dpr: number): number {
  if (isFreeZoom(zoom, dpr)) {
    return zoom;
  }
  return clamp(levelAtOrBelow(zoom * dpr) / dpr);
}

/** The nearest level to `zoom`, or `zoom` if it is free. For the end of a pinch. */
export function snapZoomNearest(zoom: number, dpr: number): number {
  if (isFreeZoom(zoom, dpr)) {
    return zoom;
  }
  const d = zoom * dpr;
  const below = levelAtOrBelow(d);
  const above = levelAbove(below);
  return clamp((d / below <= above / d ? below : above) / dpr);
}

/**
 * One step in (`direction` > 0) or out from `zoom`: by `factor` where free, else to the next
 * level. Coming down from the free zone, it stops at FREE_FROM first.
 */
export function stepZoom(zoom: number, dpr: number, direction: number, factor = 1.25): number {
  const d = zoom * dpr;
  if (direction > 0) {
    if (isFreeZoom(zoom, dpr)) {
      return clamp(zoom * factor);
    }
    return clamp(levelAbove(levelAtOrBelow(d)) / dpr);
  }
  if (d / factor >= FREE_FROM - EPS) {
    return clamp(zoom / factor);
  }
  if (d > FREE_FROM + EPS) {
    return clamp(FREE_FROM / dpr);
  }
  const level = levelAtOrBelow(d);
  return clamp((level < d - EPS ? level : levelBelow(level)) / dpr);
}
