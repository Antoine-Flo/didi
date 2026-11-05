import { describe, expect, it } from "vitest";
import { parseLayoutPrefs } from "./layout-prefs.svelte";

describe("layout preferences", () => {
  it("reads the hand and the panel sizes", () => {
    const text = JSON.stringify({
      version: 1,
      hand: "left",
      toolsPosition: 0.25,
      uiScale: 125,
      sizes: { palette: 240 },
    });
    expect(parseLayoutPrefs(text)).toEqual({
      hand: "left",
      toolsPosition: 0.25,
      uiScale: 125,
      sizes: { palette: 240 },
    });
  });

  it("ignores anything unexpected", () => {
    const text = JSON.stringify({
      hand: "both",
      toolsPosition: 2,
      sizes: { a: "big", b: -5, c: null, d: 120 },
    });
    expect(parseLayoutPrefs(text)).toEqual({ sizes: { d: 120 } });
    expect(parseLayoutPrefs("[]")).toEqual({});
    expect(parseLayoutPrefs(JSON.stringify({ sizes: 3 }))).toEqual({});
    expect(() => parseLayoutPrefs("not json")).toThrow();
    for (const uiScale of [85, 155, 102, "120", null]) {
      expect(parseLayoutPrefs(JSON.stringify({ uiScale }))).toEqual({});
    }
  });
});
