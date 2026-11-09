// Helpers shared by the core tests.

import { expect } from "vitest";
import fc from "fast-check";
import type { Drawing } from "#lib/core/document/drawing.js";
import * as edits from "#lib/core/history/edits.js";
import type { Rect } from "#lib/core/geometry.js";
import { BLEND_MODES } from "#lib/core/document/layer.js";

/** Solid color region data. */
export function fill(rect: Rect, rgba: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set(rgba, i);
  }
  return data;
}

/**
 * Region data with a varied pattern, so misplaced rows or columns are detected.
 * Colors are premultiplied: no channel exceeds alpha.
 */
export function pattern(rect: Rect, seed: number, alpha: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  const premultiply = (v: number) => Math.round(((v & 255) * alpha) / 255);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = premultiply(seed + i * 7);
    data[i + 1] = premultiply(seed * 3 + i * 13);
    data[i + 2] = premultiply(seed * 5 + i);
    data[i + 3] = alpha;
  }
  return data;
}

/** Index of the first differing byte, or -1. Much faster than toEqual on large buffers. */
export function firstDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) {
    return 0;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return -1;
}

export type DrawingState = ReturnType<typeof capture>;

/** Full observable state of a drawing: layer order, settings and pixels. */
export function capture(d: Drawing) {
  const all = { x: 0, y: 0, width: d.width, height: d.height };
  return d.layers.map(({ id, name, visible, opacity, blendMode, locked, tiles }) => ({
    props: JSON.stringify({ id, name, visible, opacity, blendMode, locked }),
    pixels: tiles.readRegion(all),
  }));
}

export function expectSameState(a: DrawingState, b: DrawingState) {
  expect(a.map((l) => l.props)).toEqual(b.map((l) => l.props));
  a.forEach((layer, i) => expect(firstDifference(layer.pixels, b[i].pixels)).toBe(-1));
}

const pick = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
const at = (p: number, size: number) => Math.floor(p * size);

const layerProps = fc.record(
  {
    name: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""),
    visible: fc.boolean(),
    opacity: fc.double({ min: 0, max: 1, noNaN: true }),
    blendMode: fc.constantFrom(...BLEND_MODES),
    locked: fc.boolean(),
  },
  { requiredKeys: [] },
);

/**
 * A random edit, built from the current state of the drawing.
 * Returns null when the edit does not apply (no layer, or painting on a locked layer).
 */
export const randomEdit: fc.Arbitrary<(d: Drawing) => edits.Edit | null> = fc.oneof(
  fc.record({ props: layerProps, where: pick }).map(
    ({ props, where }) =>
      (d: Drawing) =>
        edits.addLayer(d.createLayer(props), at(where, d.layers.length + 1)),
  ),
  pick.map(
    (which) => (d: Drawing) =>
      d.layers.length ? edits.removeLayer(d.layers[at(which, d.layers.length)].id) : null,
  ),
  fc.record({ which: pick, to: pick }).map(
    ({ which, to }) =>
      (d: Drawing) =>
        d.layers.length
          ? edits.moveLayer(d.layers[at(which, d.layers.length)].id, at(to, d.layers.length))
          : null,
  ),
  fc.record({ which: pick, props: layerProps }).map(
    ({ which, props }) =>
      (d: Drawing) =>
        d.layers.length ? edits.updateLayer(d.layers[at(which, d.layers.length)].id, props) : null,
  ),
  fc
    .record({
      which: pick,
      x: fc.integer({ min: -50, max: 300 }),
      y: fc.integer({ min: -50, max: 300 }),
      width: fc.integer({ min: 1, max: 200 }),
      height: fc.integer({ min: 1, max: 200 }),
      seed: fc.integer({ min: 0, max: 255 }),
      alpha: fc.constantFrom(0, 128, 255),
    })
    .map((p) => (d: Drawing) => {
      if (!d.layers.length) {
        return null;
      }
      const layer = d.layers[at(p.which, d.layers.length)];
      if (layer.locked) {
        return null;
      }
      return edits.writePixels(layer.id, p, pattern(p, p.seed, p.alpha));
    }),
);
