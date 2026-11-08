import { describe, expect, it } from "vitest";
import { parseLayoutPrefs } from "./layout-prefs.svelte";

describe("layout preferences", () => {
  it("reads the hand, whether the panels are open and their sizes", () => {
    const text = JSON.stringify({
      version: 1,
      hand: "left",
      toolsPosition: 0.25,
      uiScale: 125,
      panelsOpen: false,
      pixelGrid: false,
      compact: "on",
      fingerDrawing: "off",
      penSeen: true,
      sizes: { palette: 240 },
    });
    expect(parseLayoutPrefs(text)).toEqual({
      hand: "left",
      toolsPosition: 0.25,
      uiScale: 125,
      panelsOpen: false,
      pixelGrid: false,
      compact: "on",
      fingerDrawing: "off",
      penSeen: true,
      sizes: { palette: 240 },
    });
  });

  it("ignores anything unexpected", () => {
    const text = JSON.stringify({
      hand: "both",
      toolsPosition: 2,
      panelsOpen: "no",
      pixelGrid: 1,
      compact: "maybe",
      fingerDrawing: "sometimes",
      penSeen: "yes",
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
