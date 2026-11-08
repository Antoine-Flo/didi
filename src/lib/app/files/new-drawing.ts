import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { m } from "#lib/paraglide/messages.js";

export type Background = "white" | "transparent";

export const DEFAULT_SIZE = { width: 2048, height: 2048 };

/**
 * A new drawing ready to paint, with nothing in the history: a white "Background" layer
 * and an empty layer above it, active. With a transparent background, the empty layer only.
 */
export function newEditor(
  width = DEFAULT_SIZE.width,
  height = DEFAULT_SIZE.height,
  background: Background = "white",
): Editor {
  const drawing = new Drawing(width, height);
  if (background === "white") {
    const layer = drawing.createLayer({ name: m.files_background_layer() });
    drawing.addLayer(layer);
    const all = { x: 0, y: 0, width, height };
    drawing.writePixels(layer.id, all, new Uint8ClampedArray(width * height * 4).fill(255));
  }
  const editor = new Editor(drawing);
  editor.commands.execute("layer.add", {
    props: { name: m.layer_default_numbered({ number: 1 }) },
  });
  editor.history.clear();
  return editor;
}
