import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { toHex, type RGB } from "./color";
import { BUILTIN_PALETTES } from "./builtin-palettes";
import { PaletteLibrary, parseHexPalette, parsePaletteFile, type Palette } from "./palette";

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
      '{"version": 3, "palettes": []}',
      '{"version": 1}',
      '{"version": 1, "palettes": [{"name": 3, "colors": []}]}',
      '{"version": 1, "palettes": [{"name": "a", "colors": ["#ff00"]}]}',
    ];
    for (const text of bad) expect(() => parsePaletteFile(text), text).toThrow();
  });

  it("reads version 1 files: the shown palette by index, without unchanged built-in copies", () => {
    const pico = BUILTIN_PALETTES[0];
    const text = JSON.stringify({
      version: 1,
      active: 2,
      palettes: [
        { name: pico.name, colors: pico.colors.map(toHex) },
        { name: "Sweetie 16", colors: ["#ff0000"] },
        { name: "Mine", colors: [] },
      ],
    });
    const { palettes, active } = parsePaletteFile(text);
    expect(palettes.map((p) => p.name)).toEqual(["Sweetie 16", "Mine"]);
    expect(active).toBe("Mine");
  });
});

describe("PaletteLibrary", () => {
  it("lists the user's palettes first, then the built-in ones, which cannot be changed", () => {
    const library = new PaletteLibrary([{ name: "Mine", colors: [] }]);
    expect(library.palettes.map((p) => p.name)).toEqual([
      "Mine",
      ...BUILTIN_PALETTES.map((p) => p.name),
    ]);
    expect(library.active?.name).toBe("Mine");
    library.locked = false;
    expect(library.editable?.name).toBe("Mine");
    library.select(1);
    expect(library.active?.name).toBe("PICO-8");
    expect(library.editable).toBeNull();
    expect(() => library.addColor(red)).toThrow();
    expect(() => library.rename(1, "X")).toThrow();
    expect(() => library.remove(1)).toThrow();
    expect(() => library.setColor(0, red)).toThrow();
    // Names are unique among all, and the file keeps the user's palettes only.
    library.add({ name: "PICO-8", colors: [] });
    expect(library.active?.name).toBe("PICO-8 2");
    expect(library.toFile()).toEqual({
      version: 2,
      active: "PICO-8 2",
      palettes: [
        { name: "Mine", colors: [] },
        { name: "PICO-8 2", colors: [] },
      ],
    });
    // Removing a palette of the user keeps the built-in one shown.
    library.select(2);
    library.remove(0);
    expect(library.active?.name).toBe("PICO-8");
  });

  it("shows the saved palette by name, the user's first", () => {
    const shown = (active: string | null) =>
      new PaletteLibrary([{ name: "Game Boy", colors: [] }], active).active;
    expect(shown("Sweetie 16")?.name).toBe("Sweetie 16");
    expect(shown("Game Boy")?.colors).toEqual([]);
    expect(shown("Gone")?.name).toBe("Game Boy");
    expect(new PaletteLibrary().active?.name).toBe("PICO-8");
  });

  it("offers well-known palettes, each with distinct colors and a unique name", () => {
    const names = BUILTIN_PALETTES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.fromEntries(BUILTIN_PALETTES.map((p) => [p.name, p.colors.length]))).toEqual({
      "PICO-8": 16,
      "Sweetie 16": 16,
      "DawnBringer 16": 16,
      "DawnBringer 32": 32,
      "Endesga 32": 32,
      "Commodore 64": 16,
      "Game Boy": 4,
      Nyx8: 8,
      SLSO8: 8,
      "Ammo-8": 8,
      "Oil 6": 6,
      "Twilight 5": 5,
    });
    for (const { name, colors } of BUILTIN_PALETTES) {
      expect(new Set(colors.map(String)).size, name).toBe(colors.length);
    }
  });

  it("adds palettes with unique names and shows them", () => {
    const library = new PaletteLibrary([], null, []);
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
    const library = new PaletteLibrary([], null, []);
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
    const library = new PaletteLibrary([{ name: "A", colors: [] }], null, []);
    expect(library.addColor(red)).toBe(true);
    expect(library.addColor(blue)).toBe(true);
    expect(library.addColor([255, 0, 0])).toBe(false);
    library.removeColor(0);
    expect(library.active?.colors).toEqual([blue]);
    expect(() => library.removeColor(5)).toThrow();
  });

  it("notifies changes only", () => {
    const library = new PaletteLibrary([{ name: "A", colors: [] }], null, []);
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
      fc.property(fc.array(palette, { minLength: 1, maxLength: 5 }), fc.nat(), (list, shown) => {
        const library = new PaletteLibrary([], null, []);
        list.forEach((p) => library.add(p));
        library.select(shown % list.length);
        const text = JSON.stringify(library.toFile());
        const { palettes, active } = parsePaletteFile(text);
        const reloaded = new PaletteLibrary(palettes, active, []);
        expect(reloaded.palettes).toEqual(library.palettes);
        expect(reloaded.activeIndex).toBe(library.activeIndex);
      }),
      { numRuns: 300 },
    );
  });
});
