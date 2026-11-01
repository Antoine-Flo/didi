import { beforeAll, describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { History } from "#lib/core/history/history.js";
import { capture, expectSameState, fill, firstDifference } from "#lib/core/test-utils.js";
import { unpremultiply } from "#lib/core/document/pixels.js";
import { BUNDLED_BRUSHES, brushGroups, bundledBrush } from "./brushes";
import { loadMyPaint, MyPaintStroke, rgbToHsv, type Brush, type MyPaint } from "./engine";
import { parseMyb } from "./myb";

let mp: MyPaint;
beforeAll(async () => {
  mp = await loadMyPaint();
});

function setup(width = 300, height = 300) {
  const drawing = new Drawing(width, height);
  const layer = drawing.createLayer();
  drawing.addLayer(layer);
  return { drawing, id: layer.id, history: new History(drawing) };
}

function brush(id: string, size = 20, color: [number, number, number] = [220, 20, 20]): Brush {
  const b = mp.createBrush(bundledBrush(id).myb);
  b.size = size;
  b.setColor(color);
  return b;
}

/** A horizontal stroke from x0 to x1 at height y, at full pressure. */
function draw(stroke: MyPaintStroke, x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x += 2) stroke.strokeTo(x, y, 1, 0, 0, 1 / 120);
}

const pixel = (d: Drawing, id: string, x: number, y: number) => [
  ...d.getLayer(id).tiles.readRegion({ x, y, width: 1, height: 1 }),
];

describe("libmypaint engine", () => {
  it("loads every bundled brush", () => {
    expect(BUNDLED_BRUSHES.length).toBeGreaterThan(150);
    for (const b of BUNDLED_BRUSHES) {
      const created = mp.createBrush(b.myb);
      expect(created.size, b.id).toBeGreaterThan(0);
      expect(b.nativeSize, b.id).toBeGreaterThan(0);
      created.destroy();
    }
    const erasers = BUNDLED_BRUSHES.filter((b) => b.eraser).map((b) => b.id);
    expect(erasers).toContain("deevad/large_hard_eraser");
    expect(erasers).not.toContain("deevad/liner");
  });

  it("groups brushes for menus, essentials first", () => {
    const groups = brushGroups(false);
    expect(groups[0].label).toBe("Essentials");
    expect(groups[0].brushes.map((b) => b.name)).toContain("2B pencil");
    expect(groups.flatMap((g) => g.brushes).every((b) => !b.eraser)).toBe(true);
    expect(
      brushGroups(true)
        .flatMap((g) => g.brushes)
        .every((b) => b.eraser),
    ).toBe(true);
  });

  it("sets size and color", () => {
    const b = brush("deevad/basic_digital_brush", 40, [0, 0, 255]);
    expect(b.size).toBeCloseTo(40, 3);
    expect(b.get("color_h")).toBeCloseTo(2 / 3, 5);
    expect(b.get("color_v")).toBeCloseTo(1, 5);
    b.destroy();
  });

  it("paints a stroke with the brush color, only around the path", () => {
    const { drawing, id } = setup();
    const stroke = new MyPaintStroke(mp, brush("deevad/basic_digital_brush"), drawing, id);
    draw(stroke, 50, 250, 150);
    stroke.flush();
    const [r, g, b, a] = unpremultiply(new Uint8ClampedArray(pixel(drawing, id, 150, 150)));
    expect(a).toBeGreaterThan(200);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    expect(pixel(drawing, id, 150, 50)).toEqual([0, 0, 0, 0]);
    expect(pixel(drawing, id, 290, 150)).toEqual([0, 0, 0, 0]);
    stroke.finish("Brush");
  });

  it("starts each stroke where it is placed, for every brush", () => {
    for (const b of BUNDLED_BRUSHES.filter((x) => !x.eraser)) {
      const { drawing, id } = setup(400, 400);
      const fresh = mp.createBrush(b.myb);
      fresh.setColor([0, 0, 0]);
      const stroke = new MyPaintStroke(mp, fresh, drawing, id);
      stroke.moveTo(300, 300);
      for (let x = 300; x <= 380; x += 2) stroke.strokeTo(x, 300, 0.8, 0, 0, 1 / 120);
      stroke.finish("x");
      // Nothing on the way from the brush's previous position (0, 0) to the start.
      const path = drawing.getLayer(id).tiles.readRegion({ x: 0, y: 0, width: 200, height: 200 });
      let painted = 0;
      // Visible pixels only: some brushes add huge, almost transparent halos on purpose.
      for (let i = 3; i < path.length; i += 4) if (path[i] > 16) painted++;
      expect(painted, b.id).toBe(0);
      fresh.destroy();
    }
  });

  it("keeps the existing pixels around the stroke", () => {
    const { drawing, id } = setup();
    const all = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(id, all, fill(all, [0, 120, 0, 255]));
    const stroke = new MyPaintStroke(mp, brush("deevad/liner", 6), drawing, id);
    draw(stroke, 100, 200, 150);
    stroke.finish("Brush");
    // Same libmypaint tile as the stroke, but away from it.
    expect(pixel(drawing, id, 150, 135)).toEqual([0, 120, 0, 255]);
  });

  it("applies the stroke opacity to every brush, and to erasers", () => {
    const alphaAt = (opacity: number, id: string, background?: boolean) => {
      const { drawing, id: layer } = setup();
      const all = { x: 0, y: 0, width: 300, height: 300 };
      if (background) drawing.writePixels(layer, all, fill(all, [0, 0, 200, 255]));
      const stroke = new MyPaintStroke(mp, brush(id, 30), drawing, layer, opacity);
      draw(stroke, 50, 250, 150);
      stroke.finish("x");
      return pixel(drawing, layer, 150, 150)[3];
    };
    const full = alphaAt(1, "deevad/basic_digital_brush");
    expect(alphaAt(0.5, "deevad/basic_digital_brush")).toBeCloseTo(full / 2, -1);
    expect(alphaAt(0, "deevad/basic_digital_brush")).toBe(0);
    // An eraser at 50 % removes about half.
    expect(alphaAt(0.5, "deevad/large_hard_eraser", true)).toBeGreaterThan(100);
    expect(alphaAt(0.5, "deevad/large_hard_eraser", true)).toBeLessThan(160);
  });

  it("keeps valid premultiplied pixels", () => {
    const { drawing, id } = setup();
    const stroke = new MyPaintStroke(mp, brush("deevad/watercolor_glazing", 40), drawing, id);
    draw(stroke, 20, 280, 100);
    draw(stroke, 280, 20, 120);
    stroke.finish("Brush");
    const all = drawing.getLayer(id).tiles.readRegion({ x: 0, y: 0, width: 300, height: 300 });
    let invalid = 0;
    for (let i = 0; i < all.length; i += 4) {
      if (Math.max(all[i], all[i + 1], all[i + 2]) > all[i + 3]) invalid++;
    }
    expect(invalid).toBe(0);
  });

  it("makes the stroke one undo step, and can cancel", () => {
    const { drawing, id, history } = setup();
    const before = capture(drawing);
    const stroke = new MyPaintStroke(mp, brush("deevad/liner"), drawing, id);
    draw(stroke, 30, 270, 150);
    history.push(stroke.finish("Brush")!);
    const after = capture(drawing);
    expect(history.steps).toBe(1);
    history.undo();
    expectSameState(capture(drawing), before);
    history.redo();
    expectSameState(capture(drawing), after);

    const cancelled = new MyPaintStroke(mp, brush("deevad/liner"), drawing, id);
    draw(cancelled, 30, 270, 200);
    cancelled.flush();
    cancelled.cancel();
    expectSameState(capture(drawing), after);
  });

  it("erases with an eraser brush", () => {
    const { drawing, id } = setup();
    const all = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(id, all, fill(all, [0, 0, 200, 255]));
    const stroke = new MyPaintStroke(mp, brush("deevad/large_hard_eraser", 30), drawing, id);
    draw(stroke, 50, 250, 150);
    stroke.finish("Eraser");
    expect(pixel(drawing, id, 150, 150)[3]).toBeLessThan(30);
    expect(pixel(drawing, id, 150, 20)).toEqual([0, 0, 200, 255]);
  });

  it("smudges: a blending brush mixes the colors across a border", () => {
    const { drawing, id } = setup();
    const left = { x: 0, y: 0, width: 150, height: 300 };
    const right = { x: 150, y: 0, width: 150, height: 300 };
    drawing.writePixels(id, left, fill(left, [255, 0, 0, 255]));
    drawing.writePixels(id, right, fill(right, [0, 0, 255, 255]));
    const stroke = new MyPaintStroke(mp, brush("deevad/blending", 30), drawing, id);
    draw(stroke, 60, 240, 150);
    stroke.finish("Estompe");
    // Right of the border, the blue was mixed with the red brought along.
    const [r, g, b] = pixel(drawing, id, 160, 150);
    expect([r, g, b]).not.toEqual([0, 0, 255]);
    expect(r).toBeGreaterThan(0);
  });

  it("paints on a large canvas, across many tiles, and starts each stroke cleanly", () => {
    const { drawing, id } = setup(2000, 300);
    const b = brush("deevad/basic_digital_brush", 10);
    const first = new MyPaintStroke(mp, b, drawing, id);
    draw(first, 10, 1990, 50);
    first.finish("Brush");
    expect(pixel(drawing, id, 1500, 50)[3]).toBeGreaterThan(200);
    // A second stroke elsewhere must not be joined to the end of the first one.
    const second = new MyPaintStroke(mp, b, drawing, id);
    draw(second, 100, 200, 250);
    second.finish("Brush");
    expect(pixel(drawing, id, 1000, 150)).toEqual([0, 0, 0, 0]);
  });

  it("allows only one stroke at a time", () => {
    const { drawing, id } = setup();
    const b = brush("deevad/liner");
    const stroke = new MyPaintStroke(mp, b, drawing, id);
    expect(() => new MyPaintStroke(mp, b, drawing, id)).toThrow();
    stroke.finish("Brush");
    new MyPaintStroke(mp, b, drawing, id).cancel();
  });

  it("refuses locked layers", () => {
    const { drawing, id } = setup();
    drawing.updateLayer(id, { locked: true });
    expect(() => new MyPaintStroke(mp, brush("deevad/liner"), drawing, id)).toThrow();
    expect(mp.current).toBeNull();
  });

  it("paints valid pixels, deterministically, with every bundled brush", () => {
    const size = 120;
    const all = { x: 0, y: 0, width: size, height: size };
    const run = (b: (typeof BUNDLED_BRUSHES)[number]) => {
      const { drawing, id } = setup(size, size);
      // A colored background, so erasers and smudging brushes have something to work on.
      drawing.writePixels(id, all, fill(all, [40, 160, 90, 255]));
      const created = mp.createBrush(b.myb);
      created.size = Math.min(b.nativeSize, 20);
      created.setColor([200, 30, 30]);
      const stroke = new MyPaintStroke(mp, created, drawing, id);
      stroke.moveTo(15, 60);
      for (let x = 15; x <= 105; x += 3) {
        stroke.strokeTo(x, 60 + Math.sin(x / 12) * 20, 0.8, 0, 0, 1 / 120);
      }
      stroke.finish("x");
      created.destroy();
      return drawing.getLayer(id).tiles.readRegion(all);
    };
    const invalid: string[] = [];
    const differing: string[] = [];
    const silent: string[] = [];
    const background = fill(all, [40, 160, 90, 255]);
    for (const b of BUNDLED_BRUSHES) {
      const first = run(b);
      for (let i = 0; i < first.length; i += 4) {
        if (Math.max(first[i], first[i + 1], first[i + 2]) > first[i + 3]) {
          invalid.push(b.id);
          break;
        }
      }
      // Same stroke, after other strokes: libmypaint must give the same result.
      if (firstDifference(first, run(b)) !== -1) differing.push(b.id);
      if (firstDifference(first, background) === -1) silent.push(b.id);
    }
    expect(invalid).toEqual([]);
    expect(differing).toEqual([]);
    // A few brushes only act in special conditions (e.g. blur on a uniform color).
    expect(silent.length, silent.join(", ")).toBeLessThan(BUNDLED_BRUSHES.length / 10);
  });
});

describe("helpers", () => {
  it("converts RGB to HSV", () => {
    expect(rgbToHsv(1, 0, 0)).toEqual([0, 1, 1]);
    const [h, s, v] = rgbToHsv(0, 0.5, 0.5);
    expect(h).toBeCloseTo(0.5);
    expect(s).toBe(1);
    expect(v).toBe(0.5);
    expect(rgbToHsv(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it("rejects invalid brush files", () => {
    expect(() => parseMyb('{"version": 2, "settings": {}}')).toThrow();
    expect(() => parseMyb('{"version": 3}')).toThrow();
    expect(() => parseMyb('{"version": 3, "settings": {"x": {"base_value": 1}}}')).toThrow();
    expect(() =>
      parseMyb(
        '{"version": 3, "settings": {"x": {"base_value": 1, "inputs": {"pressure": [[0]]}}}}',
      ),
    ).toThrow();
  });
});
