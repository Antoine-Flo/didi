import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputReport } from "#lib/lab/input-stats.js";
import { detectSupport, reportText, type Support } from "#lib/lab/tablet-report.js";

const support: Support = {
  coalescedEvents: true,
  predictedEvents: false,
  pointerRawUpdate: false,
  altitudeAzimuth: true,
  nativeInput: false,
};

const report: InputReport = {
  dispatchedEvents: 3,
  samples: 12,
  samplesPerEvent: 4,
  sampleRate: 133.33333,
  pressureMin: 0.1,
  pressureMax: 0.9,
  pressureLevels: 7,
  tiltMax: 30,
  latencyAvg: 4.5,
  latencyMax: 9,
};

describe("detectSupport", () => {
  it("reports native input as given", () => {
    expect(detectSupport(true).nativeInput).toBe(true);
    expect(detectSupport(false).nativeInput).toBe(false);
  });
});

describe("reportText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists support, the strokes present and the button log", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const lines = reportText(support, { dom: null, native: report }, ["a", "b"]).split("\n");
    expect(lines).toContain("devicePixelRatio: 2");
    expect(lines).toContain("coalescedEvents: true");
    expect(lines).toContain("predictedEvents: false");
    expect(lines).not.toContain("--- dom");
    expect(lines).toContain("--- native");
    expect(lines).toContain("samples: 12");
    expect(lines).toContain("sampleRate: 133.333");
    expect(lines.slice(-3)).toEqual(["--- buttons", "a", "b"]);
  });
});
