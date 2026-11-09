// Edits of whole layers: duplicate, merge down, flatten, clear, flip. Each is one undo step.
// Floating content is laid first (in the same step): it belongs to a layer these may change
// or remove.

import { m } from "#lib/paraglide/messages.js";
import { composite } from "#lib/core/document/compositing.js";
import { Drawing } from "#lib/core/document/drawing.js";
import type { Layer, ReadonlyLayer } from "#lib/core/document/layer.js";
import {
  addLayer,
  group,
  removeLayer,
  replaceTiles,
  writePixels,
} from "#lib/core/history/edits.js";
import { layerTiles } from "#lib/core/selection/selection.js";
import type { Editor } from "#lib/core/editor/editor.js";

/** Runs `change` as one undo step, floating content laid first. */
function step(editor: Editor, label: string, change: () => void) {
  editor.history.begin(label);
  try {
    if (editor.selection.floating) {
      editor.applySelection();
    }
    change();
  } finally {
    editor.history.end();
  }
}

/** A new layer of `drawing` (not added) with the props and pixels of `source`. Tiles are shared. */
function copyOf(drawing: Drawing, source: ReadonlyLayer, name: string): Layer {
  const { visible, opacity, blendMode, locked, alphaLocked } = source;
  const layer = drawing.createLayer({ name, visible, opacity, blendMode, locked, alphaLocked });
  layer.tiles.restore(source.tiles.snapshot(source.tiles.keys()));
  return layer;
}

const canvasOf = (drawing: Drawing) => ({
  x: 0,
  y: 0,
  width: drawing.width,
  height: drawing.height,
});

/** Adds a copy of a layer above it, and makes it the active one. */
export function duplicateLayer(editor: Editor, id: string) {
  const { drawing } = editor;
  const source = drawing.getLayer(id);
  const copy = copyOf(drawing, source, m.layer_default_copy({ name: source.name }));
  step(editor, m.cmd_layer_duplicate(), () => {
    editor.history.push(addLayer(copy, drawing.indexOf(id) + 1));
  });
  editor.setActiveLayer(copy.id);
}

/** The layer below, if a layer can be merged into it: visible, the one below not locked. */
export function mergeTarget(editor: Editor, id: string): ReadonlyLayer | null {
  const { drawing } = editor;
  const index = drawing.indexOf(id);
  if (index === 0 || !drawing.getLayer(id).visible) {
    return null;
  }
  const below = drawing.layers[index - 1];
  return below.locked ? null : below;
}

/**
 * Lays a layer on the one below, with its opacity and blend mode, and removes it. The one
 * below keeps its own props, and becomes the active one.
 */
export function mergeDown(editor: Editor, id: string) {
  const { drawing } = editor;
  const below = mergeTarget(editor, id);
  if (!below) {
    return;
  }
  step(editor, m.cmd_layer_merge_down(), () => {
    // The two layers alone, the one below at full opacity: what it holds once merged.
    const pair = new Drawing(drawing.width, drawing.height);
    const base = copyOf(pair, below, below.name);
    pair.addLayer({ ...base, visible: true, opacity: 1, blendMode: "normal" });
    pair.addLayer(copyOf(pair, drawing.getLayer(id), "Top"));
    const canvas = canvasOf(drawing);
    editor.history.push(
      group(m.cmd_layer_merge_down(), [
        writePixels(below.id, canvas, composite(pair, canvas), m.cmd_layer_merge_down()),
        removeLayer(id),
      ]),
    );
  });
  editor.setActiveLayer(below.id);
}

/** Replaces every layer with one holding what is shown. Hidden layers are dropped. */
export function flatten(editor: Editor) {
  const { drawing } = editor;
  const canvas = canvasOf(drawing);
  step(editor, m.cmd_layer_flatten(), () => {
    const pixels = composite(drawing, canvas);
    const layer = drawing.createLayer({
      name: drawing.layers[0]?.name ?? m.layer_default_numbered({ number: 1 }),
    });
    const removed = drawing.layers.map((l) => removeLayer(l.id));
    editor.history.push(
      group(m.cmd_layer_flatten(), [
        ...removed,
        addLayer(layer, 0),
        writePixels(layer.id, canvas, pixels, m.cmd_layer_flatten()),
      ]),
    );
    editor.setActiveLayer(layer.id);
  });
}

/** Makes a whole layer transparent, whatever is selected. */
export function clearLayer(editor: Editor, id: string) {
  const { drawing } = editor;
  step(editor, m.cmd_layer_clear(), () => {
    const before = layerTiles(drawing, id);
    const after = new Map([...before.keys()].map((key) => [key, undefined]));
    editor.history.push(replaceTiles(id, before, after, m.cmd_layer_clear()));
  });
}

/** Mirrors a whole layer, across the middle of the canvas, whatever is selected. */
export function flipLayer(editor: Editor, id: string, axis: "horizontal" | "vertical") {
  const { drawing } = editor;
  const canvas = canvasOf(drawing);
  const { width, height } = canvas;
  const label = axis === "horizontal" ? m.cmd_layer_flip_horizontal() : m.cmd_layer_flip_vertical();
  step(editor, label, () => {
    const pixels = drawing.getLayer(id).tiles.readRegion(canvas);
    const flipped = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < height; y++) {
      const to = axis === "vertical" ? height - 1 - y : y;
      for (let x = 0; x < width; x++) {
        const s = (y * width + x) * 4;
        const d = (to * width + (axis === "horizontal" ? width - 1 - x : x)) * 4;
        flipped.set(pixels.subarray(s, s + 4), d);
      }
    }
    editor.history.push(writePixels(id, canvas, flipped, label));
  });
}
