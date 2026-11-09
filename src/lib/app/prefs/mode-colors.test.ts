import { describe, expect, it } from "vitest";
import {
  parseModeColors,
  RECENT_COLORS_MAX,
  withRecent,
} from "#lib/app/prefs/mode-colors.svelte.js";

describe("mode colors", () => {
  it("puts the latest recent color first, once", () => {
    const list = withRecent(
      [
        [1, 1, 1],
        [2, 2, 2],
        [3, 3, 3],
      ],
      [2, 2, 2],
    );
    expect(list).toEqual([
      [2, 2, 2],
      [1, 1, 1],
      [3, 3, 3],
    ]);
  });

  it("keeps no more than the maximum", () => {
    let list = withRecent([], [0, 0, 0]);
    for (let i = 1; i < RECENT_COLORS_MAX + 5; i++) {
      list = withRecent(list, [i, i, i]);
    }
    expect(list).toHaveLength(RECENT_COLORS_MAX);
    expect(list[0]).toEqual([RECENT_COLORS_MAX + 4, RECENT_COLORS_MAX + 4, RECENT_COLORS_MAX + 4]);
  });

  it("reads each mode's colors, ignoring what it does not understand", () => {
    const text = JSON.stringify({
      version: 1,
      modes: {
        pixel: { color: "#ff0000", secondary: null, recent: ["#00ff00", "nope", 3, null] },
        painting: { color: "red", recent: "#000000" },
        other: "#000000",
      },
    });
    expect(parseModeColors(text)).toEqual({
      pixel: { color: [255, 0, 0], secondary: null, recent: [[0, 255, 0]] },
      painting: { recent: [] },
    });
    expect(parseModeColors("null")).toEqual({});
    expect(parseModeColors("{}")).toEqual({});
  });
});
