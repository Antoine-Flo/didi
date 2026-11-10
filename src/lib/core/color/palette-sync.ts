// The color picker edits the palette color being used: when the palettes are unlocked and
// the current color is the one clicked in the shown palette (see PaletteLibrary.picked),
// changing it in the picker changes that palette color too, live while dragging. A drag is
// one undo step. A color merely equal to one of the palette's is not followed.

import { sameColor, type RGB } from "#lib/core/color/color.js";
import type { Palette, PaletteLibrary } from "#lib/core/color/palette.js";
import { changePaletteColor } from "#lib/core/color/palette-edits.js";
import type { History } from "#lib/core/history/history.js";

interface Target {
  palette: Readonly<Palette>;
  index: number;
  before: RGB;
}

export class PaletteColorSync {
  /** The palette color followed during a drag in the picker. */
  private dragged: Target | null = null;

  constructor(
    private readonly library: () => PaletteLibrary | null,
    private readonly history: () => History,
  ) {}

  /** A drag starts in the picker, from the current color. */
  start(current: RGB | null) {
    this.dragged = this.find(current);
  }

  /** The picker changes the current color from `previous` to `next`. */
  change(previous: RGB | null, next: RGB) {
    const library = this.library();
    if (!library) {
      return;
    }
    if (this.dragged) {
      const { palette, index } = this.dragged;
      if (library.indexOf(palette) >= 0) {
        library.setColor(index, next, palette);
      }
      return;
    }
    // Not a drag (e.g. the hex code): one step.
    const target = this.find(previous);
    if (target) {
      this.history().push(
        changePaletteColor(library, target.palette, target.index, target.before, next),
      );
    }
  }

  /** The drag ends: the change becomes an undo step. */
  end() {
    const target = this.dragged;
    this.dragged = null;
    const library = this.library();
    if (!target || !library || library.indexOf(target.palette) < 0) {
      return;
    }
    const after = target.palette.colors[target.index];
    if (sameColor(after, target.before)) {
      return;
    }
    this.history().push(
      changePaletteColor(library, target.palette, target.index, target.before, [...after] as RGB),
    );
  }

  private find(color: RGB | null): Target | null {
    const library = this.library();
    const palette = library?.editable;
    const index = library?.picked ?? null;
    if (!palette || !color || index === null || !sameColor(palette.colors[index], color)) {
      return null;
    }
    return { palette, index, before: [...color] as RGB };
  }
}
