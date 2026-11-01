// Color palettes: named lists of colors, edited by the user, saved as JSON and imported
// from .hex files (the format of Lospec: one "rrggbb" color per line).
//
// The library notifies every change, so the interface can refresh and save it.

import { fromHex, sameColor, toHex, type RGB } from "./color";
import { Emitter } from "../emitter";

export interface Palette {
  name: string;
  colors: RGB[];
}

/** What is saved: readable JSON, colors as "#rrggbb". */
export interface PaletteFile {
  version: 1;
  /** Index of the palette shown in the interface. */
  active: number;
  palettes: { name: string; colors: string[] }[];
}

export const PALETTE_FILE_VERSION = 1;

/** The palette a new library starts with: PICO-8's 16 colors, a classic for game art. */
export const DEFAULT_PALETTES: Palette[] = [
  {
    name: "PICO-8",
    colors: [
      "000000",
      "1d2b53",
      "7e2553",
      "008751",
      "ab5236",
      "5f574f",
      "c2c3c7",
      "fff1e8",
      "ff004d",
      "ffa300",
      "ffec27",
      "00e436",
      "29adff",
      "83769c",
      "ff77a8",
      "ffccaa",
    ].map((hex) => fromHex(hex)!),
  },
];

/**
 * Reads a .hex palette: one color per line, "rrggbb" or "#rrggbb". Empty lines are skipped.
 * Throws on any other line, or if there is no color.
 */
export function parseHexPalette(text: string, name: string): Palette {
  const colors: RGB[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const color = fromHex(line);
    if (!color) throw new Error(`Line ${i + 1} is not a color: "${line.trim().slice(0, 20)}"`);
    colors.push(color);
  });
  if (colors.length === 0) throw new Error("The file has no colors");
  return { name, colors };
}

/** Reads a saved library. Throws if the file is not valid. */
export function parsePaletteFile(text: string): { palettes: Palette[]; active: number } {
  const data = JSON.parse(text) as Partial<PaletteFile>;
  if (typeof data !== "object" || data === null) throw new Error("Not a palette file");
  if (data.version !== PALETTE_FILE_VERSION) {
    throw new Error(`Unsupported palette file version: ${data.version}`);
  }
  if (!Array.isArray(data.palettes)) throw new Error("Missing palettes");
  const palettes = data.palettes.map((p, i) => {
    if (typeof p?.name !== "string" || !Array.isArray(p.colors)) {
      throw new Error(`Invalid palette #${i + 1}`);
    }
    const colors = p.colors.map((hex) => {
      const color = typeof hex === "string" ? fromHex(hex) : null;
      if (!color) throw new Error(`Invalid color in "${p.name}": ${hex}`);
      return color;
    });
    return { name: p.name, colors };
  });
  const active = Number.isInteger(data.active) ? data.active! : 0;
  return { palettes, active: Math.max(0, Math.min(active, palettes.length - 1)) };
}

export class PaletteLibrary {
  private list: Palette[];
  private shown: number;
  private changes = new Emitter<void>();

  constructor(palettes: Palette[] = DEFAULT_PALETTES, active = 0) {
    this.list = palettes.map(copy);
    this.shown = Math.max(0, Math.min(active, this.list.length - 1));
  }

  get palettes(): readonly Readonly<Palette>[] {
    return this.list;
  }

  /** Index of the palette shown, 0 when the library is empty. */
  get activeIndex(): number {
    return this.shown;
  }

  get active(): Readonly<Palette> | null {
    return this.list[this.shown] ?? null;
  }

  /** Calls `listener` after every change. */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }

  select(index: number) {
    this.checkIndex(index);
    if (index === this.shown) return;
    this.shown = index;
    this.changes.emit();
  }

  /** Adds a palette after the others and shows it. Its name is made unique. */
  add(palette: Palette) {
    this.list.push({ ...copy(palette), name: this.uniqueName(palette.name) });
    this.shown = this.list.length - 1;
    this.changes.emit();
  }

  /** Removes a palette (the shown one by default). The previous one is then shown. */
  remove(index = this.shown) {
    this.checkIndex(index);
    this.list.splice(index, 1);
    if (this.shown >= index) this.shown = Math.max(0, this.shown - 1);
    this.changes.emit();
  }

  rename(index: number, name: string) {
    this.checkIndex(index);
    const trimmed = name.trim();
    if (!trimmed) throw new RangeError("Palette name must not be empty");
    if (trimmed === this.list[index].name) return;
    this.list[index].name = this.uniqueName(trimmed, index);
    this.changes.emit();
  }

  /** Adds a color at the end of the shown palette, unless it is already there. */
  addColor(color: RGB): boolean {
    const palette = this.active;
    if (!palette || palette.colors.some((c) => sameColor(c, color))) return false;
    this.list[this.shown].colors.push([...color]);
    this.changes.emit();
    return true;
  }

  /** Removes a color of the shown palette. */
  removeColor(index: number) {
    const palette = this.list[this.shown];
    if (!palette || !Number.isInteger(index) || index < 0 || index >= palette.colors.length) {
      throw new RangeError(`No color at ${index}`);
    }
    palette.colors.splice(index, 1);
    this.changes.emit();
  }

  toFile(): PaletteFile {
    return {
      version: PALETTE_FILE_VERSION,
      active: this.shown,
      palettes: this.list.map((p) => ({ name: p.name, colors: p.colors.map(toHex) })),
    };
  }

  /** "Name", or "Name 2", "Name 3"… if taken by another palette than `except`. */
  private uniqueName(name: string, except = -1): string {
    const taken = (n: string) => this.list.some((p, i) => i !== except && p.name === n);
    if (!taken(name)) return name;
    let i = 2;
    while (taken(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  }

  private checkIndex(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.list.length) {
      throw new RangeError(`No palette at ${index}`);
    }
  }
}

function copy(palette: Palette): Palette {
  return { name: palette.name, colors: palette.colors.map((c) => [...c] as RGB) };
}
