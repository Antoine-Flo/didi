import { describe, expect, it } from "vitest";
import { BRUSH_SETS, setOfBrush } from "./brush-sets";
import { BUNDLED_BRUSHES, findBundledBrush } from "./brushes";

describe("brush sets", () => {
  it("hold every bundled brush exactly once", () => {
    const listed = BRUSH_SETS.flatMap((s) => [...s.picks, ...s.more]);
    for (const id of listed) {
      expect(findBundledBrush(id), id).toBeDefined();
    }
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(BUNDLED_BRUSHES.map((b) => b.id).sort());
  });

  it("keep erasers in the eraser set, and only there", () => {
    for (const brush of BUNDLED_BRUSHES) {
      expect(setOfBrush(brush.id)?.id === "eraser", brush.id).toBe(brush.eraser);
    }
  });

  it("each have a first selection", () => {
    for (const set of BRUSH_SETS) {
      expect(set.picks.length, set.id).toBeGreaterThan(0);
    }
  });
});
