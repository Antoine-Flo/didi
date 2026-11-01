import { Drawing } from "$lib/core/drawing";
import { Editor } from "$lib/core/editor";

/**
 * A new drawing ready to paint: a white "Background" layer, and an empty layer above it, active.
 * Nothing in the history.
 */
export function newEditor(width = 2048, height = 2048): Editor {
  const drawing = new Drawing(width, height);
  const background = drawing.createLayer({ name: "Background" });
  drawing.addLayer(background);
  const all = { x: 0, y: 0, width, height };
  drawing.writePixels(background.id, all, new Uint8ClampedArray(width * height * 4).fill(255));
  const editor = new Editor(drawing);
  editor.commands.execute("layer.add", { props: { name: "Layer 1" } });
  editor.history.clear();
  return editor;
}
