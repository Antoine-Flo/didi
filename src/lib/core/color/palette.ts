// Color palettes: named lists of colors. The built-in ones come with the app and cannot be
// changed; the user's own are edited, saved as JSON and imported from .hex files (the
// format of Lospec: one "rrggbb" color per line).
//
// The library lists the user's palettes first, then the built-in ones. It notifies every change,
// so the interface can refresh and save it.

import { m } from "#lib/paraglide/messages.js";
import { fromHex, sameColor, toHex, type RGB } from "./color";
import { Emitter } from "../emitter";
import { BUILTIN_PALETTES } from "./builtin-palettes";

export interface Palette {
  name: string;
  colors: RGB[];
}

/** What is saved: the user's palettes only, as readable JSON, colors as "#rrggbb". */
export interface PaletteFile {
  version: 2;
  /** Name of the palette shown in the interface, built-in or not. */
  active: string | null;
  palettes: { name: string; colors: string[] }[];
}

export const PALETTE_FILE_VERSION = 2;

/**
 * Reads a .hex palette: one color per line, "rrggbb" or "#rrggbb". Empty lines are skipped.
 * Throws on any other line, or if there is no color.
 */
export function parseHexPalette(text: string, name: string): Palette {
  const colors: RGB[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const color = fromHex(line);
    if (!color)
      throw new Error(
        m.palette_error_line_not_color({ number: i + 1, text: line.trim().slice(0, 20) }),
      );
    colors.push(color);
  });
  if (colors.length === 0) throw new Error(m.palette_error_no_colors());
  return { name, colors };
}

/**
 * Reads the user's saved palettes, and the name of the palette shown. Throws if the file is
 * not valid.
 *
 * Version 1 files also held copies of the built-in palettes, and the shown one by index:
 * unchanged copies are left out, the built-in palette being there anyway.
 */
export function parsePaletteFile(text: string): { palettes: Palette[]; active: string | null } {
  const data = JSON.parse(text) as Partial<Omit<PaletteFile, "version" | "active">> & {
    version?: unknown;
    active?: unknown;
  };
  if (typeof data !== "object" || data === null)
    throw new Error(m.palette_error_not_palette_file());
  if (data.version !== 1 && data.version !== PALETTE_FILE_VERSION) {
    throw new Error(m.palette_error_unsupported_version({ version: String(data.version) }));
  }
  if (!Array.isArray(data.palettes)) throw new Error(m.palette_error_missing_palettes());
  let palettes = data.palettes.map((p, i) => {
    if (typeof p?.name !== "string" || !Array.isArray(p.colors)) {
      throw new Error(m.palette_error_invalid_palette({ number: i + 1 }));
    }
    const colors = p.colors.map((hex) => {
      const color = typeof hex === "string" ? fromHex(hex) : null;
      if (!color)
        throw new Error(m.palette_error_invalid_color({ name: p.name, color: String(hex) }));
      return color;
    });
    return { name: p.name, colors };
  });
  if (data.version === 1) {
    const index = Number.isInteger(data.active) ? (data.active as number) : 0;
    const active = palettes[Math.max(0, Math.min(index, palettes.length - 1))]?.name ?? null;
    palettes = palettes.filter((p) => !BUILTIN_PALETTES.some((b) => samePalette(b, p)));
    return { palettes, active };
  }
  return { palettes, active: typeof data.active === "string" ? data.active : null };
}

export class PaletteLibrary {
  private readonly builtins: readonly Palette[];
  /** The user's palettes, before the built-in ones. */
  private list: Palette[];
  /** Index of the palette shown, among all. */
  private shown = 0;
  private changes = new Emitter<void>();
  private isLocked = true;

  /**
   * The user's `palettes`, then `builtins`. Shows the palette named `active` (the user's
   * first, if both have that name), else the first one.
   */
  constructor(
    palettes: readonly Palette[] = [],
    active: string | null = null,
    builtins: readonly Palette[] = BUILTIN_PALETTES,
  ) {
    this.builtins = builtins;
    this.list = palettes.map(copy);
    const all = this.palettes;
    const own = all.findIndex((p, i) => !this.isBuiltin(i) && p.name === active);
    this.shown = Math.max(0, own >= 0 ? own : all.findIndex((p) => p.name === active));
  }

  /** The user's palettes, then the built-in ones. */
  get palettes(): readonly Readonly<Palette>[] {
    return [...this.list, ...this.builtins];
  }

  isBuiltin(index: number): boolean {
    return index >= this.list.length;
  }

  /** Index of the palette shown, 0 when the library is empty. */
  get activeIndex(): number {
    return this.shown;
  }

  get active(): Readonly<Palette> | null {
    return this.palettes[this.shown] ?? null;
  }

  /** The palette shown, if it can be edited: one of the user's, while unlocked. */
  get editable(): Readonly<Palette> | null {
    return this.isLocked || this.isBuiltin(this.shown) ? null : this.active;
  }

  /**
   * Locked, the user's palettes should not be edited (colors, name, deletion): a guard
   * against mistakes, checked by the commands. Locked at start, not saved.
   */
  get locked(): boolean {
    return this.isLocked;
  }

  set locked(locked: boolean) {
    if (locked === this.isLocked) return;
    this.isLocked = locked;
    this.changes.emit();
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

  /** Adds a palette of the user, after the others, and shows it. Its name is made unique. */
  add(palette: Readonly<Palette>) {
    this.list.push({ ...copy(palette), name: this.uniqueName(palette.name) });
    this.shown = this.list.length - 1;
    this.changes.emit();
  }

  /** Removes a palette of the user (the shown one by default). The previous one is then shown. */
  remove(index = this.shown) {
    this.own(index);
    this.list.splice(index, 1);
    if (this.shown >= index) this.shown = Math.max(0, this.shown - 1);
    this.changes.emit();
  }

  rename(index: number, name: string) {
    const palette = this.own(index);
    const trimmed = name.trim();
    if (!trimmed) throw new RangeError("Palette name must not be empty");
    if (trimmed === palette.name) return;
    palette.name = this.uniqueName(trimmed, index);
    this.changes.emit();
  }

  /** Adds a color at the end of the shown palette, unless it is already there. */
  addColor(color: RGB): boolean {
    const palette = this.active;
    if (!palette || palette.colors.some((c) => sameColor(c, color))) return false;
    this.own(this.shown).colors.push([...color]);
    this.changes.emit();
    return true;
  }

  /** Removes a color of a palette, the shown one by default. */
  removeColor(index: number, palette = this.active) {
    this.colorsOf(palette, index).splice(index, 1);
    this.changes.emit();
  }

  /** Inserts a color in a palette (the shown one by default), duplicates allowed. */
  insertColor(index: number, color: RGB, palette = this.active) {
    this.colorsOf(palette, index, true).splice(index, 0, [...color]);
    this.changes.emit();
  }

  /** Replaces a color of a palette, the shown one by default. */
  setColor(index: number, color: RGB, palette = this.active) {
    const colors = this.colorsOf(palette, index);
    if (sameColor(colors[index], color)) return;
    colors[index] = [...color];
    this.changes.emit();
  }

  /** Index of a palette of the library, -1 if it is not (or no longer) there. */
  indexOf(palette: Readonly<Palette>): number {
    return this.palettes.indexOf(palette);
  }

  toFile(): PaletteFile {
    return {
      version: PALETTE_FILE_VERSION,
      active: this.active?.name ?? null,
      palettes: this.list.map((p) => ({ name: p.name, colors: p.colors.map(toHex) })),
    };
  }

  /** "Name", or "Name 2", "Name 3"… if taken by another palette than `except`. */
  private uniqueName(name: string, except = -1): string {
    const all = this.palettes;
    const taken = (n: string) => all.some((p, i) => i !== except && p.name === n);
    if (!taken(name)) return name;
    let i = 2;
    while (taken(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  }

  /** The user's palette at `index`. Throws for a built-in palette. */
  private own(index: number): Palette {
    this.checkIndex(index);
    if (this.isBuiltin(index)) throw new RangeError("Built-in palettes cannot be changed");
    return this.list[index];
  }

  /** The colors of `palette`, if `index` is one of them (or the end, with `orEnd`). */
  private colorsOf(palette: Readonly<Palette> | null, index: number, orEnd = false): RGB[] {
    const at = palette ? this.indexOf(palette) : -1;
    if (at < 0) throw new RangeError("No such palette");
    const found = this.own(at);
    const end = found.colors.length + (orEnd ? 1 : 0);
    if (!Number.isInteger(index) || index < 0 || index >= end) {
      throw new RangeError(`No color at ${index}`);
    }
    return found.colors;
  }

  private checkIndex(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.builtins.length + this.list.length) {
      throw new RangeError(`No palette at ${index}`);
    }
  }
}

function copy(palette: Readonly<Palette>): Palette {
  return { name: palette.name, colors: palette.colors.map((c) => [...c] as RGB) };
}

function samePalette(a: Readonly<Palette>, b: Readonly<Palette>): boolean {
  return (
    a.name === b.name &&
    a.colors.length === b.colors.length &&
    a.colors.every((c, i) => sameColor(c, b.colors[i]))
  );
}
