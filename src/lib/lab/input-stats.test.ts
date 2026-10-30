import { describe, expect, it } from "vitest";
import { InputStats, type InputSample } from "./input-stats";

const sample = (time: number, pressure = 0.5, tiltX = 0, tiltY = 0): InputSample => ({
  time,
  pressure,
  tiltX,
  tiltY,
});

describe("InputStats", () => {
  it("reports zeros when nothing was recorded", () => {
    const r = new InputStats().report();
    expect(r.samples).toBe(0);
    expect(r.sampleRate).toBe(0);
    expect(r.pressureMin).toBe(0);
    expect(r.samplesPerEvent).toBe(0);
  });

  it("ignores events without samples", () => {
    const stats = new InputStats();
    stats.record([], 10, 5);
    expect(stats.report().dispatchedEvents).toBe(0);
  });

  it("computes the sample rate over the stroke duration", () => {
    const stats = new InputStats();
    // 5 samples, 5 ms apart = 200 Hz
    stats.record([sample(0), sample(5)], 6, 5);
    stats.record([sample(10), sample(15), sample(20)], 21, 20);
    const r = stats.report();
    expect(r.samples).toBe(5);
    expect(r.dispatchedEvents).toBe(2);
    expect(r.samplesPerEvent).toBe(2.5);
    expect(r.sampleRate).toBeCloseTo(200);
  });

  it("tracks pressure range and distinct levels", () => {
    const stats = new InputStats();
    stats.record([sample(0, 0.1), sample(1, 0.5), sample(2, 0.5), sample(3, 0.9)], 3, 3);
    const r = stats.report();
    expect(r.pressureMin).toBe(0.1);
    expect(r.pressureMax).toBe(0.9);
    expect(r.pressureLevels).toBe(3);
  });

  it("tracks the maximum absolute tilt", () => {
    const stats = new InputStats();
    stats.record([sample(0, 0.5, -40, 10), sample(1, 0.5, 20, 30)], 1, 1);
    expect(stats.report().tiltMax).toBe(40);
  });

  it("measures handling latency and never goes negative", () => {
    const stats = new InputStats();
    stats.record([sample(0)], 4, 0);
    stats.record([sample(1)], 1, 3);
    const r = stats.report();
    expect(r.latencyAvg).toBe(2);
    expect(r.latencyMax).toBe(4);
  });
});
