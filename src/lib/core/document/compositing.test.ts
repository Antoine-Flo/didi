import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { composite } from "./compositing";
import { Drawing } from "./drawing";
import { BLEND_MODES, type BlendMode, type LayerProps } from "./layer";
import { fill, firstDifference, pattern } from "./test-utils";

type RGBA = [number, number, number, number];
const px = { x: 0, y: 0, width: 1, height: 1 };

/** A 1×1 drawing with one layer per given pixel, bottom to top. */
function stack(layers: { color: RGBA; props?: Partial<LayerProps> }[]): Drawing {
  const d = new Drawing(1, 1);
  for (const { color, props } of layers) {
    const layer = d.createLayer(props);
    d.addLayer(layer);
    d.writePixels(layer.id, px, fill(px, color));
  }
  return d;
}

const pixel = (d: Drawing) => [...composite(d, px)];

/** Premultiplies a straight color. */
const pm = (r: number, g: number, b: number, a: number): RGBA => [
  Math.round((r * a) / 255),
  Math.round((g * a) / 255),
  Math.round((b * a) / 255),
  a,
];

function expectClose(actual: number[], expected: number[], tolerance = 1) {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(tolerance));
}

/** Blend functions written independently from the implementation, on straight colors. */
const MODEL: Record<Exclude<BlendMode, "add">, (b: number, s: number) => number> = {
  normal: (_, s) => s,
  screen: (b, s) => 1 - (1 - b) * (1 - s),
};

describe("composite", () => {
  it("returns a transparent image without layers, or the background", () => {
    const d = new Drawing(2, 2);
    const all = { x: 0, y: 0, width: 2, height: 2 };
    expect([...composite(d, all)]).toEqual(new Array(16).fill(0));
    expect([...composite(d, all, { background: [255, 255, 255, 255] })]).toEqual(
      new Array(16).fill(255),
    );
  });

  it("returns a single normal layer unchanged", () => {
    const d = new Drawing(300, 300);
    const layer = d.createLayer();
    d.addLayer(layer);
    const all = { x: 0, y: 0, width: 300, height: 300 };
    d.writePixels(layer.id, all, pattern(all, 7, 200));
    expect(firstDifference(composite(d, all), layer.tiles.readRegion(all))).toBe(-1);
  });

  it("ignores hidden layers and layers at zero opacity", () => {
    const base = pm(10, 20, 30, 255);
    const red = pm(255, 0, 0, 255);
    expect(pixel(stack([{ color: base }, { color: red, props: { visible: false } }]))).toEqual(
      base,
    );
    expect(pixel(stack([{ color: base }, { color: red, props: { opacity: 0 } }]))).toEqual(base);
  });

  it("applies the layer opacity", () => {
    const d = stack([
      { color: pm(0, 0, 0, 255) },
      { color: pm(255, 255, 255, 255), props: { opacity: 0.5 } },
    ]);
    expectClose(pixel(d), [128, 128, 128, 255]);
  });

  it("covers the backdrop with an opaque normal layer", () => {
    const top = pm(1, 2, 3, 255);
    expect(pixel(stack([{ color: pm(200, 100, 50, 255) }, { color: top }]))).toEqual(top);
  });

  it("composites semi-transparent normal layers (source-over)", () => {
    // 50% red over 50% blue: alpha 0.75, color (0.5 red + 0.25 blue) premultiplied.
    const d = stack([{ color: pm(0, 0, 255, 128) }, { color: pm(255, 0, 0, 128) }]);
    expectClose(pixel(d), [128, 0, 64, 192]);
  });

  it("computes known blend results over an opaque backdrop", () => {
    const backdrop = pm(200, 100, 50, 255);
    const source = pm(100, 150, 250, 255);
    const result = (blendMode: BlendMode) =>
      pixel(stack([{ color: backdrop }, { color: source, props: { blendMode } }]));
    expectClose(result("screen"), [222, 191, 251, 255]);
    expectClose(result("add"), [255, 250, 255, 255]);
  });

  it("shows the layer itself over a transparent backdrop, whatever the mode", () => {
    for (const blendMode of BLEND_MODES) {
      const color = pm(90, 180, 30, 160);
      expectClose(pixel(stack([{ color, props: { blendMode } }])), color);
    }
  });

  it("matches an independent model over opaque backdrops (property)", () => {
    const channel = fc.integer({ min: 0, max: 255 });
    fc.assert(
      fc.property(
        fc.tuple(channel, channel, channel),
        fc.tuple(channel, channel, channel, channel),
        fc.constantFrom(...(Object.keys(MODEL) as (keyof typeof MODEL)[])),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (backdrop, [r, g, b, a], blendMode, opacity) => {
          const d = stack([
            { color: pm(...backdrop, 255) },
            { color: pm(r, g, b, a), props: { blendMode, opacity } },
          ]);
          // Over an opaque backdrop: result = mix(Cb, B(Cb, Cs), source alpha).
          // The source color is the premultiplied one, as stored, un-premultiplied again.
          const stored = pm(r, g, b, a);
          const alpha = (a / 255) * opacity;
          const expected = [0, 1, 2].map((c) => {
            const cb = backdrop[c] / 255;
            const cs = a === 0 ? 0 : stored[c] / a;
            return Math.round(((1 - alpha) * cb + alpha * MODEL[blendMode](cb, cs)) * 255);
          });
          expectClose(pixel(d), [...expected, 255]);
        },
      ),
      { numRuns: 1000 },
    );
  });

  const layerSpec = fc.record({
    seed: fc.integer({ min: 0, max: 255 }),
    alpha: fc.constantFrom(0, 1, 64, 200, 255),
    x: fc.integer({ min: -20, max: 280 }),
    y: fc.integer({ min: -20, max: 280 }),
    width: fc.integer({ min: 1, max: 300 }),
    height: fc.integer({ min: 1, max: 300 }),
    blendMode: fc.constantFrom(...BLEND_MODES),
    opacity: fc.double({ min: 0, max: 1, noNaN: true }),
    visible: fc.boolean(),
  });

  type LayerSpec = typeof layerSpec extends fc.Arbitrary<infer T> ? T : never;

  function build(specs: LayerSpec[]) {
    const d = new Drawing(300, 280);
    for (const s of specs) {
      const layer = d.createLayer({
        blendMode: s.blendMode,
        opacity: s.opacity,
        visible: s.visible,
      });
      d.addLayer(layer);
      d.writePixels(layer.id, s, pattern(s, s.seed, s.alpha));
    }
    return d;
  }

  it("always produces valid premultiplied pixels (property)", () => {
    fc.assert(
      fc.property(fc.array(layerSpec, { maxLength: 5 }), (specs) => {
        const out = composite(build(specs), { x: 0, y: 0, width: 300, height: 280 });
        for (let i = 0; i < out.length; i += 4) {
          const a = out[i + 3];
          if (out[i] > a || out[i + 1] > a || out[i + 2] > a) {
            expect.fail(`pixel ${i / 4}: ${[...out.subarray(i, i + 4)]}`);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it("gives the same pixels for a region as for the whole image (property)", () => {
    fc.assert(
      fc.property(
        fc.array(layerSpec, { minLength: 1, maxLength: 4 }),
        fc.record({
          x: fc.integer({ min: -30, max: 300 }),
          y: fc.integer({ min: -30, max: 280 }),
          width: fc.integer({ min: 1, max: 330 }),
          height: fc.integer({ min: 1, max: 310 }),
        }),
        (specs, region) => {
          // A full opaque base layer, so every region has content to misplace.
          const base = {
            ...specs[0],
            seed: 99,
            alpha: 255 as const,
            x: 0,
            y: 0,
            width: 300,
            height: 280,
          };
          const d = build([{ ...base, blendMode: "normal", opacity: 1, visible: true }, ...specs]);
          const whole = composite(d, { x: 0, y: 0, width: 300, height: 280 });
          const part = composite(d, region);
          for (let y = 0; y < region.height; y++) {
            for (let x = 0; x < region.width; x++) {
              const cx = region.x + x;
              const cy = region.y + y;
              const i = (y * region.width + x) * 4;
              const outside = cx < 0 || cy < 0 || cx >= 300 || cy >= 280;
              const expected = outside
                ? [0, 0, 0, 0]
                : [...whole.subarray((cy * 300 + cx) * 4, (cy * 300 + cx) * 4 + 4)];
              if (
                part[i] !== expected[0] ||
                part[i + 1] !== expected[1] ||
                part[i + 2] !== expected[2] ||
                part[i + 3] !== expected[3]
              ) {
                expect.fail(`(${cx}, ${cy}): ${[...part.subarray(i, i + 4)]} vs ${expected}`);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
