import { describe, expect, it } from "vitest";
import { parseLayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";

describe("layout preferences", () => {
  it("reads the hand, whether the panels are open and their sizes", () => {
    const text = JSON.stringify({
      version: 1,
      hand: "left",
      toolsEdge: "opposite",
      toolsPosition: 0.25,
      navEdge: "panels",
      navPosition: 0.5,
      uiScale: 125,
      panelsOpen: false,
      pixelGrid: false,
      compact: "on",
      fingerDrawing: "off",
      penSeen: true,
      colorPanels: { painting: { selector: "triangle", shades: true, recent: false } },
      sizes: { palette: 240 },
    });
    expect(parseLayoutPrefs(text)).toEqual({
      hand: "left",
      toolsEdge: "opposite",
      toolsPosition: 0.25,
      navEdge: "panels",
      navPosition: 0.5,
      uiScale: 125,
      panelsOpen: false,
      pixelGrid: false,
      compact: "on",
      fingerDrawing: "off",
      penSeen: true,
      colorPanels: { painting: { selector: "triangle", shades: true, recent: false } },
      sizes: { palette: 240 },
    });
  });

  it("ignores anything unexpected", () => {
    const text = JSON.stringify({
      hand: "both",
      toolsEdge: "left",
      toolsPosition: 2,
      navPosition: -1,
      panelsOpen: "no",
      pixelGrid: 1,
      compact: "maybe",
      fingerDrawing: "sometimes",
      penSeen: "yes",
      colorPanels: { pixel: { selector: "circle", shades: "yes", recent: "yes" } },
      sizes: { a: "big", b: -5, c: null, d: 120 },
    });
    expect(parseLayoutPrefs(text)).toEqual({ sizes: { d: 120 }, colorPanels: { pixel: {} } });
    expect(parseLayoutPrefs("[]")).toEqual({});
    expect(parseLayoutPrefs(JSON.stringify({ sizes: 3 }))).toEqual({});
    expect(() => parseLayoutPrefs("not json")).toThrow();
    for (const uiScale of [85, 155, 102, "120", null]) {
      expect(parseLayoutPrefs(JSON.stringify({ uiScale }))).toEqual({});
    }
  });
});
