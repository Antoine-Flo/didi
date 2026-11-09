// What the open document was when last saved, to tell whether it has changed since (see
// Session.dirty).

import type { TileGrid } from "#lib/core/file/didi-file.js";
import type { Editor } from "#lib/core/editor/editor.js";

export const sameGrid = (a: TileGrid, b: TileGrid) =>
  a.width === b.width && a.height === b.height && a.shown === b.shown;

/** The document as last saved, to tell whether it has changed since. */
export interface SavedState {
  /** See History.marker. */
  marker: unknown;
  mode: string;
  grid: TileGrid;
  /** Visibility is saved, but is not in the history. */
  hidden: ReadonlySet<string>;
}

export const savedStateOf = (editor: Editor, mode: string, grid: TileGrid): SavedState => ({
  marker: editor.history.marker,
  mode,
  grid,
  hidden: new Set(editor.drawing.layers.filter((l) => !l.visible).map((l) => l.id)),
});
