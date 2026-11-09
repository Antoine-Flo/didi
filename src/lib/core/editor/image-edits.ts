// Edits of the whole image: canvas size, crop, trim, scale, rotate, flip. Each changes every
// layer, often the canvas size with them, as one undo step. The selection is laid and
// removed first, in the same step: its place would no longer mean anything.

import { m } from "#lib/paraglide/messages.js";
import type { CanvasContent, Drawing } from "#lib/core/document/drawing.js";
import { contentBounds } from "#lib/core/document/layer-thumbnail.js";
import { TileStore, type TileSnapshot } from "#lib/core/document/tiles.js";
import type { Edit } from "#lib/core/history/edits.js";
import { appliedState } from "#lib/core/selection/selection.js";
import type { Rect } from "#lib/core/shared/geometry.js";
import type { Editor } from "#lib/core/editor/editor.js";

/** The largest canvas side, as when creating a document. */
export const MAX_CANVAS_SIZE = 8192;

/** Every layer's pixels, premultiplied RGBA, and the canvas size they have. */
type Pixels = { width: number; height: number; data: Uint8ClampedArray };

/** Replaces the canvas size and every layer's tiles, and back. */
function canvasEdit(label: string, after: CanvasContent): Edit {
  let before: CanvasContent | undefined;
  return {
    label,
    apply(d) {
      const previous = d.resizeCanvas(after);
      before ??= previous;
    },
    revert(d) {
      d.resizeCanvas(before!);
    },
    bytes: () => {
      let tiles = 0;
      for (const content of [before, after]) {
        for (const layer of content?.layers.values() ?? []) {
          for (const tile of layer.values()) {
            if (tile) {
              tiles++;
            }
          }
        }
      }
      return tiles * 256 * 256 * 4;
    },
  };
}

/**
 * Changes every layer with `change`, which gets its pixels and returns the new ones, at the
 * new canvas size: one undo step, the selection removed first.
 */
function transformImage(
  editor: Editor,
  label: string,
  width: number,
  height: number,
  change: (pixels: Pixels) => Uint8ClampedArray,
) {
  const { drawing, history } = editor;
  const canvas = { x: 0, y: 0, width: drawing.width, height: drawing.height };
  const layers = new Map<string, TileSnapshot>();
  for (const layer of drawing.layers) {
    const store = new TileStore(width, height);
    if (layer.tiles.tileCount > 0) {
      const data = change({ ...canvas, data: layer.tiles.readRegion(canvas) });
      store.writeRegion({ x: 0, y: 0, width, height }, data);
    }
    layers.set(layer.id, store.snapshot(store.keys()));
  }
  history.begin(label);
  try {
    if (editor.selection.floating) {
      editor.applySelection();
    }
    if (editor.selection.rect) {
      editor.deselect();
    }
    history.push(canvasEdit(label, { width, height, layers }));
  } finally {
    history.end();
  }
}

const validSize = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_CANVAS_SIZE;

/**
 * Changes the canvas size without scaling: the pixels move by (`dx`, `dy`), what goes past
 * the edges is cut, and what is new is transparent.
 */
export function resizeCanvas(
  editor: Editor,
  width: number,
  height: number,
  dx: number,
  dy: number,
  label = m.history_canvas_size(),
) {
  if (!validSize(width) || !validSize(height)) {
    throw new RangeError("Invalid canvas size");
  }
  transformImage(editor, label, width, height, (from) => {
    const out = new Uint8ClampedArray(width * height * 4);
    const x0 = Math.max(0, dx);
    const x1 = Math.min(width, from.width + dx);
    if (x1 <= x0) {
      return out;
    }
    for (let y = Math.max(0, dy); y < Math.min(height, from.height + dy); y++) {
      const s = ((y - dy) * from.width + (x0 - dx)) * 4;
      out.set(from.data.subarray(s, s + (x1 - x0) * 4), (y * width + x0) * 4);
    }
    return out;
  });
}

/** Cuts the canvas to `rect`, which may reach past it (the new parts are transparent). */
export function crop(editor: Editor, rect: Rect, label = m.history_crop()) {
  resizeCanvas(editor, rect.width, rect.height, -rect.x, -rect.y, label);
}

/** The rectangle around the selection, floating content as it is shown, in the canvas. */
export function selectionBounds(editor: Editor): Rect | null {
  return appliedState(editor.drawing, editor.selection.state).rect;
}

/** The rectangle around what is drawn on every layer, hidden ones too. Null: nothing is. */
export function drawnBounds(drawing: Drawing): Rect | null {
  let bounds: Rect | null = null;
  for (const layer of drawing.layers) {
    const b = contentBounds(layer.tiles);
    if (!b) {
      continue;
    }
    if (!bounds) {
      bounds = b;
      continue;
    }
    const x = Math.min(bounds.x, b.x);
    const y = Math.min(bounds.y, b.y);
    bounds = {
      x,
      y,
      width: Math.max(bounds.x + bounds.width, b.x + b.width) - x,
      height: Math.max(bounds.y + bounds.height, b.y + b.height) - y,
    };
  }
  return bounds;
}

/** Cuts the canvas to what is drawn. False if nothing is, or it already fits. */
export function trim(editor: Editor): boolean {
  const { drawing } = editor;
  const bounds = drawnBounds(drawing);
  if (!bounds || (bounds.width === drawing.width && bounds.height === drawing.height)) {
    return false;
  }
  crop(editor, bounds, m.cmd_image_trim());
  return true;
}

/** Turns the image by quarter turns, clockwise. */
export function rotateImage(editor: Editor, quarters: 1 | 2 | 3) {
  const { width: w, height: h } = editor.drawing;
  const [width, height] = quarters === 2 ? [w, h] : [h, w];
  const label =
    quarters === 1
      ? m.cmd_image_rotate_right()
      : quarters === 3
        ? m.cmd_image_rotate_left()
        : m.cmd_image_rotate180();
  transformImage(editor, label, width, height, (from) => {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [nx, ny] =
          quarters === 1
            ? [h - 1 - y, x]
            : quarters === 2
              ? [w - 1 - x, h - 1 - y]
              : [y, w - 1 - x];
        const s = (y * w + x) * 4;
        out.set(from.data.subarray(s, s + 4), (ny * width + nx) * 4);
      }
    }
    return out;
  });
}

/** Mirrors the whole image: every layer, across the middle of the canvas. */
export function flipImage(editor: Editor, axis: "horizontal" | "vertical") {
  const { width, height } = editor.drawing;
  const label = axis === "horizontal" ? m.cmd_image_flip_horizontal() : m.cmd_image_flip_vertical();
  transformImage(editor, label, width, height, (from) => {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const ny = axis === "vertical" ? height - 1 - y : y;
      for (let x = 0; x < width; x++) {
        const nx = axis === "horizontal" ? width - 1 - x : x;
        const s = (y * width + x) * 4;
        out.set(from.data.subarray(s, s + 4), (ny * width + nx) * 4);
      }
    }
    return out;
  });
}

/**
 * Scales the whole image to a new size. `smooth` mixes pixels (averages when shrinking,
 * blends when enlarging), for painting; otherwise each pixel is taken whole, nearest, for
 * pixel art.
 */
export function scaleImage(editor: Editor, width: number, height: number, smooth: boolean) {
  if (!validSize(width) || !validSize(height)) {
    throw new RangeError("Invalid image size");
  }
  transformImage(editor, m.history_image_size(), width, height, (from) =>
    smooth ? resampleSmooth(from, width, height) : resampleNearest(from, width, height),
  );
}

function resampleNearest(from: Pixels, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const columns = Array.from({ length: width }, (_, x) =>
    Math.min(from.width - 1, Math.floor(((x + 0.5) * from.width) / width)),
  );
  for (let y = 0; y < height; y++) {
    const row = Math.min(from.height - 1, Math.floor(((y + 0.5) * from.height) / height));
    for (let x = 0; x < width; x++) {
      const s = (row * from.width + columns[x]) * 4;
      out.set(from.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return out;
}

/** For each new pixel along an axis, the old pixels it takes from, and how much of each. */
function weights(from: number, to: number): { index: number; weight: number }[][] {
  const scale = from / to;
  return Array.from({ length: to }, (_, i) => {
    if (scale > 1) {
      // Shrinking: the average of the old pixels it covers, partly at both ends.
      const start = i * scale;
      const end = start + scale;
      const parts = [];
      for (let j = Math.floor(start); j < Math.ceil(end) && j < from; j++) {
        const weight = Math.min(end, j + 1) - Math.max(start, j);
        if (weight > 0) {
          parts.push({ index: j, weight: weight / scale });
        }
      }
      return parts;
    }
    // Enlarging: between the two old pixels around its center.
    const center = (i + 0.5) * scale - 0.5;
    const left = Math.floor(center);
    const f = center - left;
    const clamp = (j: number) => Math.min(from - 1, Math.max(0, j));
    return [
      { index: clamp(left), weight: 1 - f },
      { index: clamp(left + 1), weight: f },
    ];
  });
}

/** Premultiplied pixels mix correctly as they are. Two passes: across, then down. */
function resampleSmooth(from: Pixels, width: number, height: number): Uint8ClampedArray {
  const across = weights(from.width, width);
  const down = weights(from.height, height);
  const middle = new Float32Array(width * from.height * 4);
  for (let y = 0; y < from.height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      for (const { index, weight } of across[x]) {
        const s = (y * from.width + index) * 4;
        for (let c = 0; c < 4; c++) {
          middle[d + c] += from.data[s + c] * weight;
        }
      }
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const pixel = new Float32Array(4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixel.fill(0);
      for (const { index, weight } of down[y]) {
        const s = (index * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          pixel[c] += middle[s + c] * weight;
        }
      }
      const d = (y * width + x) * 4;
      const alpha = Math.round(pixel[3]);
      out[d + 3] = alpha;
      // Rounding must not leave a color above its alpha.
      for (let c = 0; c < 3; c++) {
        out[d + c] = Math.min(alpha, Math.round(pixel[c]));
      }
    }
  }
  return out;
}
