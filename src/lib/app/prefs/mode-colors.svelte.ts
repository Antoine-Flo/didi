// The colors of each mode (pixel art and painting do not share theirs), kept from one session
// to the next in the app data folder: the current and second colors, and the colors drawn
// with lately, the latest first. A color enters the recent ones when a stroke drawn with it
// is done, not while choosing it: the picker's in-between colors would fill the list.

import { DataFile } from "#lib/app/shared/data-file.js";
import { fromHex, sameColor, toHex, type RGB } from "#lib/core/color/color.js";
import { m } from "#lib/paraglide/messages.js";

const VERSION = 1;
/** How many recent colors each mode keeps: one row of the color panel. */
export const RECENT_COLORS_MAX = 12;

/** A mode's colors. Undefined current colors: none saved yet, the app keeps its own. */
export interface ColorsOfMode {
  /** Null: no color selected. */
  color?: RGB | null;
  secondary?: RGB | null;
  /** The latest first. */
  recent: RGB[];
}

/** `list` with `color` first, once, and no more than `max` colors. */
export function withRecent(list: readonly RGB[], color: RGB, max = RECENT_COLORS_MAX): RGB[] {
  return [color, ...list.filter((c) => !sameColor(c, color))].slice(0, max);
}

/** A saved color: "#rrggbb", or null for none. Undefined if invalid. */
function parseColor(value: unknown): RGB | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? (fromHex(value) ?? undefined) : undefined;
}

/** The colors in a saved file, by mode id. Anything unexpected is ignored: they are not precious. */
export function parseModeColors(text: string): Record<string, ColorsOfMode> {
  const modes: Record<string, ColorsOfMode> = {};
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || !("modes" in data)) {
    return modes;
  }
  if (typeof data.modes !== "object" || data.modes === null) {
    return modes;
  }
  for (const [mode, saved] of Object.entries(data.modes)) {
    if (typeof saved !== "object" || saved === null) {
      continue;
    }
    const colors: ColorsOfMode = { recent: [] };
    if ("color" in saved && parseColor(saved.color) !== undefined) {
      colors.color = parseColor(saved.color);
    }
    if ("secondary" in saved && parseColor(saved.secondary) !== undefined) {
      colors.secondary = parseColor(saved.secondary);
    }
    if ("recent" in saved && Array.isArray(saved.recent)) {
      colors.recent = (saved.recent as unknown[])
        .map(parseColor)
        .filter((c): c is RGB => c != null)
        .slice(0, RECENT_COLORS_MAX);
    }
    modes[mode] = colors;
  }
  return modes;
}

export class ModeColors {
  private modes = $state<Record<string, ColorsOfMode>>({});
  private readonly file = new DataFile("colors.json", {
    content: () => this.toFile(),
    saveFailed: (error) => m.app_colors_save_failed({ error }),
  });

  /** A mode's saved current and second colors, if any. */
  current(mode: string): { color: RGB | null; secondary: RGB | null } | null {
    const saved = this.modes[mode];
    return saved?.color !== undefined && saved.secondary !== undefined
      ? { color: saved.color, secondary: saved.secondary }
      : null;
  }

  /**
   * The current and second colors changed in `mode`. Ignored before loading: the saved ones
   * are applied then.
   */
  setCurrent(mode: string, color: RGB | null, secondary: RGB | null) {
    if (!this.file.loaded) {
      return;
    }
    const saved = this.current(mode);
    const same = (a: RGB | null, b: RGB | null) => (a && b ? sameColor(a, b) : a === b);
    if (saved && same(saved.color, color) && same(saved.secondary, secondary)) {
      return;
    }
    this.modes[mode] = { ...this.of(mode), color, secondary };
    this.file.scheduleSave();
  }

  /** A mode's recent colors, the latest first. */
  recent(mode: string): readonly RGB[] {
    return this.modes[mode]?.recent ?? [];
  }

  /** A stroke was drawn with `color` in `mode`. */
  addRecent(mode: string, color: RGB) {
    const list = this.recent(mode);
    if (list.length > 0 && sameColor(list[0], color)) {
      return;
    }
    this.modes[mode] = { ...this.of(mode), recent: withRecent(list, color) };
    this.file.scheduleSave();
  }

  clearRecent(mode: string) {
    if (this.recent(mode).length > 0) {
      this.modes[mode] = { ...this.of(mode), recent: [] };
      this.file.scheduleSave();
    }
  }

  private of(mode: string): ColorsOfMode {
    return this.modes[mode] ?? { recent: [] };
  }

  /** Reads the saved colors. Recent colors added before keep their place, first. */
  async load(onError: (message: string) => void): Promise<void> {
    this.file.onError = onError;
    try {
      const text = await this.file.load();
      if (text !== null) {
        for (const [mode, saved] of Object.entries(parseModeColors(text))) {
          let recent = saved.recent;
          for (const c of [...this.recent(mode)].reverse()) {
            recent = withRecent(recent, c);
          }
          this.modes[mode] = { ...saved, recent };
        }
      }
    } catch {
      // An unreadable file only loses the colors.
    }
    this.file.markLoaded();
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  flush(): Promise<void> {
    return this.file.flush();
  }

  private toFile() {
    const hex = (c: RGB | null | undefined) => (c ? toHex(c) : c);
    const modes = Object.fromEntries(
      Object.entries(this.modes).map(([mode, { color, secondary, recent }]) => [
        mode,
        { color: hex(color), secondary: hex(secondary), recent: recent.map(toHex) },
      ]),
    );
    return { version: VERSION, modes };
  }
}
