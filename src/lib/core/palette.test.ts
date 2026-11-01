import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { RGB } from "./color";
import {
  DEFAULT_PALETTES,
  PaletteLibrary,
  parseHexPalette,
  parsePaletteFile,
  type Palette,
} from "./palette";

const red: RGB = [255, 0, 0];
const blue: RGB = [0, 0, 255];

describe("parseHexPalette", () => {
  it("reads Lospec .hex files", () => {
    const palette = parseHexPalette("ff0000\r\n0000FF\n\n#00ff00\n", "Test");
    expect(palette).toEqual({ name: "Test", colors: [red, blue, [0, 255, 0]] });
  });

  it("rejects invalid lines and empty files, with the line number", () => {
    expect(() => parseHexPalette("ff0000\nhello\n", "x")).toThrow(/Line 2/);
    expect(() => parseHexPalette("\n\n", "x")).toThrow(/no colors/);
  });
});

describe("parsePaletteFile", () => {
  it("rejects invalid files", () => {
    const bad = [
      "not json",
      "null",
      '{"version": 2, "palettes": []}',
      '{"version": 1}',
      '{"version": 1, "palettes": [{"name": 3, "colors": []}]}',
      '{"version": 1, "palettes": [{"name": "a", "colors": ["#ff00"]}]}',
    ];
    for (const text of bad) expect(() => parsePaletteFile(text), text).toThrow();
  });

  it("clamps the active index", () => {
    const text = JSON.stringify({ version: 1, active: 7, palettes: [{ name: "a", colors: [] }] });
    expect(parsePaletteFile(text).active).toBe(0);
  });
});

describe("PaletteLibrary", () => {
  it("starts with the default palettes, without sharing them", () => {
    const library = new PaletteLibrary();
    library.addColor([1, 2, 3]);
    expect(library.active?.name).toBe("PICO-8");
    expect(DEFAULT_PALETTES[0].colors).toHaveLength(16);
  });

  it("adds palettes with unique names and shows them", () => {
    const library = new PaletteLibrary([]);
    library.add({ name: "A", colors: [] });
    library.add({ name: "A", colors: [] });
    library.add({ name: "A", colors: [] });
    expect(library.palettes.map((p) => p.name)).toEqual(["A", "A 2", "A 3"]);
    expect(library.activeIndex).toBe(2);
    library.rename(0, "A 3");
    expect(library.palettes[0].name).toBe("A 3 2");
    expect(() => library.rename(0, "  ")).toThrow();
  });

  it("shows a neighbor after removing the shown palette", () => {
    const library = new PaletteLibrary([]);
    for (const name of ["A", "B", "C"]) library.add({ name, colors: [] });
    library.select(1);
    library.remove();
    expect(library.active?.name).toBe("A");
    library.remove();
    expect(library.active?.name).toBe("C");
    library.remove();
    expect(library.active).toBeNull();
    expect(library.addColor(red)).toBe(false);
  });

  it("adds each color once, and removes colors", () => {
    const library = new PaletteLibrary([{ name: "A", colors: [] }]);
    expect(library.addColor(red)).toBe(true);
    expect(library.addColor(blue)).toBe(true);
    expect(library.addColor([255, 0, 0])).toBe(false);
    library.removeColor(0);
    expect(library.active?.colors).toEqual([blue]);
    expect(() => library.removeColor(5)).toThrow();
  });

  it("notifies changes only", () => {
    const library = new PaletteLibrary([{ name: "A", colors: [] }]);
    const listener = vi.fn();
    library.subscribe(listener);
    library.select(0);
    library.rename(0, "A");
    library.addColor(red);
    library.addColor(red);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("saves and reloads any library", () => {
    const color = fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ) as fc.Arbitrary<RGB>;
    const palette: fc.Arbitrary<Palette> = fc.record({
      name: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim() === s && s !== ""),
      colors: fc.array(color, { maxLength: 8 }),
    });
    fc.assert(
      fc.property(fc.array(palette, { minLength: 1, maxLength: 5 }), fc.nat(), (list, active) => {
        const library = new PaletteLibrary([]);
        list.forEach((p) => library.add(p));
        library.select(active % list.length);
        const text = JSON.stringify(library.toFile());
        const reloaded = parsePaletteFile(text);
        expect(reloaded.palettes).toEqual(library.palettes);
        expect(reloaded.active).toBe(library.activeIndex);
      }),
      { numRuns: 300 },
    );
  });
});
