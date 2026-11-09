import { describe, expect, it } from "vitest";
import { FrameStats } from "#lib/lab/frame-stats.js";

describe("FrameStats", () => {
  it("reports zeros when empty", () => {
    expect(new FrameStats().report()).toEqual({ fps: 0, avg: 0, p95: 0, max: 0 });
  });

  it("computes average, fps and max", () => {
    const stats = new FrameStats();
    for (const v of [10, 20, 30]) {
      stats.push(v);
    }
    const r = stats.report();
    expect(r.avg).toBe(20);
    expect(r.fps).toBe(50);
    expect(r.max).toBe(30);
  });

  it("computes the 95th percentile", () => {
    const stats = new FrameStats();
    for (let i = 1; i <= 100; i++) {
      stats.push(i);
    }
    expect(stats.report().p95).toBe(95);
  });

  it("only keeps the most recent values", () => {
    const stats = new FrameStats(3);
    for (const v of [100, 1, 2, 3]) {
      stats.push(v);
    }
    expect(stats.report().max).toBe(3);
  });

  it("can be reset", () => {
    const stats = new FrameStats();
    stats.push(16);
    stats.reset();
    expect(stats.report().avg).toBe(0);
  });
});
