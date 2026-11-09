import { beforeAll, describe, expect, it } from "vitest";
import { BUNDLED_BRUSHES, bundledBrush } from "#lib/mypaint/brushes.js";
import { rgbToHsv, type Brush } from "#lib/mypaint/brush.js";
import { loadMyPaint, type MyPaint } from "#lib/mypaint/engine.js";

let mp: MyPaint;
beforeAll(async () => {
  mp = await loadMyPaint();
});

function brush(id: string, size = 20, color: [number, number, number] = [220, 20, 20]): Brush {
  const b = mp.createBrush(bundledBrush(id).myb);
  b.size = size;
  b.setColor(color);
  return b;
}

describe("libmypaint brushes", () => {
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

  it("sets size and color", () => {
    const b = brush("deevad/basic_digital_brush", 40, [0, 0, 255]);
    expect(b.size).toBeCloseTo(40, 3);
    expect(b.get("color_h")).toBeCloseTo(2 / 3, 5);
    expect(b.get("color_v")).toBeCloseTo(1, 5);
    b.destroy();
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
});
