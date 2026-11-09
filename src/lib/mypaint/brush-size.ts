// How large a brush really paints, measured by painting test strokes. Run for every bundled
// brush by `npm run measure:brushes`, which writes brush-sizes.json (see brushes.ts).
//
// A brush's size in Didi is the largest diameter it paints over the pressure range, like
// Krita's: the outline under the pen shows it. Reading it from the brush's curves misses what
// else changes the radius (inputs following the pressure with a delay, speed, random
// offsets…), so it is measured instead: strokes going from no pressure to full pressure, one
// across and one down (a flat tip paints wider in one direction), over stripes so that
// smudging and erasing show too.

import { Drawing } from "#lib/core/document/drawing.js";
import type { MybBrush } from "#lib/mypaint/myb.js";
import type { MyPaint } from "#lib/mypaint/engine.js";
import { MyPaintStroke } from "#lib/mypaint/engine.js";

/** libmypaint's base diameter for the test strokes. */
const BASE = 20;
/** The test stroke's length, and the room on each side of it. */
const LENGTH = 360;
const ROOM = 260;
const MARGIN = 30;
/** Samples of a test stroke, 1/120 s apart: about 2 s, for slow inputs to follow. */
const SAMPLES = 240;
/** A pixel counts as painted when a channel changed by more than this (out of 255). */
const CHANGED = 16;
/** Stripes under the stroke: smudging shows where they get mixed. */
const STRIPE = 2;
/** The size kept: nearly the largest along the stroke, ignoring stray dabs. */
const PERCENTILE = 0.9;

/**
 * The largest painted diameter, relative to libmypaint's base diameter (the brush's `size`):
 * set `size` to the wanted diameter divided by this. `curves`: the estimate from the brush's
 * curves, kept when the measure fails.
 */
export function measureSizeFactor(mp: MyPaint, myb: MybBrush, curves: number): number {
  const sizes = [measure(mp, myb, false), measure(mp, myb, true)].filter(
    (s): s is number => s !== null,
  );
  // Very faint brushes barely mark a single stroke: the measure then misses most of them.
  // Not below half the curves' estimate: else the brush would get huge, and slow.
  return Math.max(sizes.length ? Math.max(...sizes) : curves, curves / 2);
}

/**
 * Paints a test stroke, across or down, and returns its painted width relative to the base
 * diameter. Null when it left no mark.
 */
function measure(mp: MyPaint, myb: MybBrush, down: boolean): number | null {
  // Along: the stroke's direction; side: across it.
  const along = LENGTH + 2 * MARGIN;
  const side = 2 * ROOM;
  const width = down ? side : along;
  const height = down ? along : side;
  const drawing = new Drawing(width, height);
  const layer = drawing.createLayer();
  drawing.addLayer(layer);
  const all = { x: 0, y: 0, width, height };
  const before = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Stripes across the stroke.
      const v = Math.floor((down ? y : x) / STRIPE) % 2 ? 255 : 0;
      before.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  drawing.writePixels(layer.id, all, before);

  const at = (t: number) =>
    down ? { x: ROOM, y: MARGIN + t * LENGTH } : { x: MARGIN + t * LENGTH, y: ROOM };
  const brush = mp.createBrush(myb);
  try {
    brush.size = BASE;
    brush.setColor([255, 0, 0]);
    const stroke = new MyPaintStroke(mp, brush, drawing, layer.id);
    const start = at(0);
    stroke.moveTo(start.x, start.y);
    for (let i = 1; i <= SAMPLES; i++) {
      const p = at(i / SAMPLES);
      // From no pressure to full over the first two thirds, then full.
      const pressure = Math.min(1, (i / SAMPLES) * 1.5);
      stroke.strokeTo(p.x, p.y, pressure, 0, 0, 1 / 120);
    }
    stroke.finish("Measure");
  } finally {
    brush.destroy();
  }

  // The painted width at each step along the stroke.
  const after = drawing.getLayer(layer.id).tiles.readRegion(all);
  const widths: number[] = [];
  for (let a = MARGIN; a < MARGIN + LENGTH; a++) {
    let first = -1;
    let last = -1;
    for (let s = 0; s < side; s++) {
      const i = (down ? a * width + s : s * width + a) * 4;
      let changed = false;
      for (let c = 0; c < 4; c++) {
        changed ||= Math.abs(after[i + c] - before[i + c]) > CHANGED;
      }
      if (!changed) {
        continue;
      }
      if (first < 0) {
        first = s;
      }
      last = s;
    }
    if (first >= 0) {
      widths.push(last - first + 1);
    }
  }
  if (widths.length === 0) {
    return null;
  }
  widths.sort((a, b) => a - b);
  const size = widths[Math.floor((widths.length - 1) * PERCENTILE)];
  return size > 1 ? size / BASE : null;
}
