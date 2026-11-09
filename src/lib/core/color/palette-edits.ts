// Undoable changes to the colors of a palette, kept in the document's history so that undo
// follows the order of the user's actions. They do not touch the drawing.
//
// Undoing or redoing one shows its palette, to see the change. A palette deleted since is
// left alone.

import { m } from "#lib/paraglide/messages.js";
import type { Edit } from "#lib/core/history/edits.js";
import type { RGB } from "#lib/core/color/color.js";
import type { Palette, PaletteLibrary } from "#lib/core/color/palette.js";

function paletteEdit(
  label: string,
  library: PaletteLibrary,
  palette: Readonly<Palette>,
  apply: () => void,
  revert: () => void,
): Edit {
  const shown = (run: () => void) => () => {
    const index = library.indexOf(palette);
    if (index < 0) {
      return;
    }
    library.select(index);
    run();
  };
  return { label, apply: shown(apply), revert: shown(revert), outsideDrawing: true };
}

/** Adds `color` at the end of the shown palette. */
export function addPaletteColor(library: PaletteLibrary, color: RGB): Edit {
  const palette = library.active!;
  const index = palette.colors.length;
  return paletteEdit(
    m.history_add_palette_color(),
    library,
    palette,
    () => library.insertColor(index, color, palette),
    () => library.removeColor(index, palette),
  );
}

/** Removes a color of the shown palette. */
export function removePaletteColor(library: PaletteLibrary, index: number): Edit {
  const palette = library.active!;
  const color = [...palette.colors[index]] as RGB;
  return paletteEdit(
    m.history_remove_palette_color(),
    library,
    palette,
    () => library.removeColor(index, palette),
    () => library.insertColor(index, color, palette),
  );
}

/** Changes a color of `palette` from `before` to `after`. */
export function changePaletteColor(
  library: PaletteLibrary,
  palette: Readonly<Palette>,
  index: number,
  before: RGB,
  after: RGB,
): Edit {
  return paletteEdit(
    m.history_change_palette_color(),
    library,
    palette,
    () => library.setColor(index, after, palette),
    () => library.setColor(index, before, palette),
  );
}
