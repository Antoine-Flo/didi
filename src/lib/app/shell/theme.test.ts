import { describe, expect, it } from "vitest";
import {
  buildTheme,
  DARK_THEME,
  DEFAULT_CHOICE,
  LIGHT_THEME,
  tintGray,
} from "#lib/app/shell/theme.js";
import { parseThemeChoice } from "#lib/app/shell/theme-prefs.svelte.js";

describe("tintGray", () => {
  it("keeps a gray as it is without chroma", () => {
    expect(tintGray("#1c1c1c", 70, 0)).toBe("#1c1c1c");
    expect(tintGray("#d4d4d4", 250, 0)).toBe("#d4d4d4");
  });

  it("warms a gray: more red than blue, about as light", () => {
    const warm = tintGray("#262626", 70, 0.01);
    const [r, , b] = [1, 3, 5].map((i) => parseInt(warm.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect(Math.abs(r - 0x26)).toBeLessThan(6);
  });
});

describe("buildTheme", () => {
  it("is the dark or light theme, tinted", () => {
    const dark = buildTheme(DEFAULT_CHOICE);
    const light = buildTheme({ ...DEFAULT_CHOICE, mode: "light" });
    expect(dark.scheme).toBe("dark");
    expect(light.scheme).toBe("light");
    expect(dark.tokens.bg).not.toBe(DARK_THEME.tokens.bg);
    expect(light.tokens.bg).not.toBe(LIGHT_THEME.tokens.bg);
  });

  it("tints the canvas's background less than the window's", () => {
    const tinted = buildTheme(DEFAULT_CHOICE).tokens;
    expect(tinted["canvas-bg"]).not.toBe(DARK_THEME.tokens["canvas-bg"]);
    expect(tinted["canvas-bg"]).not.toBe(tinted.bg);
  });

  it("keeps neutral grays without the tint, and a chosen canvas color", () => {
    const neutral = buildTheme({ ...DEFAULT_CHOICE, tint: false }).tokens;
    expect(neutral.bg).toBe(DARK_THEME.tokens.bg);
    expect(neutral["canvas-bg"]).toBe(DARK_THEME.tokens["canvas-bg"]);
    expect(buildTheme({ ...DEFAULT_CHOICE, canvas: "#808080" }).tokens["canvas-bg"]).toBe(
      "#808080",
    );
  });
});

describe("parseThemeChoice", () => {
  it("keeps known values only", () => {
    expect(parseThemeChoice('{"mode":"light","tint":false,"canvas":"blue"}')).toEqual({
      mode: "light",
      tint: false,
    });
    expect(parseThemeChoice('{"canvas":"#808080"}')).toEqual({ canvas: "#808080" });
  });
});
