import { describe, expect, it } from "vitest";
import { placeDabs } from "./dabs";

describe("placeDabs", () => {
  it("places dabs at regular intervals", () => {
    const run = placeDabs({ x: 0, y: 0 }, { x: 10, y: 0 }, 3, 0);
    expect(run.dabs.map((p) => p.x)).toEqual([3, 6, 9]);
    expect(run.carry).toBeCloseTo(1);
  });

  it("continues the spacing across segments", () => {
    const first = placeDabs({ x: 0, y: 0 }, { x: 10, y: 0 }, 3, 0);
    const second = placeDabs({ x: 10, y: 0 }, { x: 20, y: 0 }, 3, first.carry);
    expect(second.dabs.map((p) => p.x)).toEqual([12, 15, 18]);
  });

  it("places no dab on a segment shorter than the remaining spacing", () => {
    const run = placeDabs({ x: 0, y: 0 }, { x: 1, y: 0 }, 3, 0);
    expect(run.dabs).toEqual([]);
    expect(run.carry).toBeCloseTo(1);
  });

  it("handles zero-length segments", () => {
    const run = placeDabs({ x: 5, y: 5 }, { x: 5, y: 5 }, 3, 1);
    expect(run.dabs).toEqual([]);
    expect(run.carry).toBeCloseTo(1);
  });

  it("follows diagonal segments", () => {
    const run = placeDabs({ x: 0, y: 0 }, { x: 3, y: 4 }, 5, 0);
    expect(run.dabs).toHaveLength(1);
    expect(run.dabs[0].x).toBeCloseTo(3);
    expect(run.dabs[0].y).toBeCloseTo(4);
  });
});
