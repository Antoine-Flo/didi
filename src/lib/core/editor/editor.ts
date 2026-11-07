// An editing session: a drawing, its history, the commands and the active layer.
//
// The active layer is editor state, not part of the drawing, and is not undoable. It is
// kept valid after every history change.

import { CommandRegistry } from "./commands";
import type { Drawing } from "../document/drawing";
import { Emitter } from "../emitter";
import { History, type HistoryOptions } from "../history/history";
import type { ReadonlyLayer } from "../document/layer";
import { addLayer, group, writePixels } from "../history/edits";
import { intersect, type Rect } from "../geometry";
import { mirrored } from "../selection/placement";
import { shapeMask, shapeOf } from "../selection/shape";
import {
  NO_SELECTION,
  Selection,
  allSelected,
  appliedState,
  changedTiles,
  floatingImage,
  invertedState,
  layerTiles,
  lift,
  selectionOfMask,
  placementOf,
  selectionEdit,
  showFloating,
  type Floating,
  type SelectionState,
} from "../selection/selection";

/** Pixels taken from or put in a layer: premultiplied RGBA, row by row. */
export interface Image {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}
import { registerEditorCommands } from "./editor-commands";

export class Editor {
  readonly history: History;
  readonly commands: CommandRegistry<Editor>;
  readonly selection = new Selection();
  private activeId: string | null = null;
  private activeChanges = new Emitter<string | null>();
  /** Last known index of the active layer, to pick a neighbor if it disappears. */
  private activeIndex = 0;

  constructor(
    readonly drawing: Drawing,
    options: HistoryOptions = {},
  ) {
    this.history = new History(drawing, options);
    this.history.subscribe(() => this.keepActiveLayerValid());
    this.commands = new CommandRegistry<Editor>(this);
    registerEditorCommands(this.commands);
    // Start on the top layer, like most drawing apps.
    this.activeIndex = Math.max(0, drawing.layers.length - 1);
    this.keepActiveLayerValid();
  }

  get activeLayer(): ReadonlyLayer | null {
    return this.activeId === null ? null : this.drawing.getLayer(this.activeId);
  }

  setActiveLayer(id: string | null) {
    if (id !== null) this.activeIndex = this.drawing.indexOf(id);
    this.setActiveId(id);
  }

  /** Calls `listener` with the new active layer id whenever it changes. */
  onActiveLayerChange(listener: (id: string | null) => void): () => void {
    return this.activeChanges.subscribe(listener);
  }

  /** Lays floating content where it is shown. The selection stays, cut to the canvas. */
  applySelection() {
    const before = this.selection.state;
    if (!before.floating) return;
    const after = appliedState(this.drawing, before);
    this.history.push(selectionEdit(this.selection, "Apply selection", before, after));
  }

  /** Puts floating content back where it was, or else removes the selection. */
  cancelSelection() {
    const before = this.selection.state;
    const { floating } = before;
    if (!floating) return this.deselect();
    // Pasted content may come from beyond the canvas: what is left of it there.
    const rect = before.shape ? floating.origin : intersect(floating.origin, this.canvas);
    const after = { rect, shape: rect && before.shape, floating: null };
    const pixels = changedTiles(
      floating.layerId,
      layerTiles(this.drawing, floating.layerId),
      floating.original,
    );
    this.history.push(selectionEdit(this.selection, "Cancel selection", before, after, pixels));
  }

  /** Removes the selection. Floating content stays where it is shown. */
  deselect() {
    const before = this.selection.state;
    if (!before.rect) return;
    this.history.push(selectionEdit(this.selection, "Deselect", before, NO_SELECTION));
  }

  /** Selects the whole canvas. Floating content stays where it is shown. */
  selectAll() {
    const before = this.selection.state;
    this.history.push(
      selectionEdit(this.selection, "Select all", before, allSelected(this.drawing)),
    );
  }

  /** Selects what the selection leaves out, floating content laid first. */
  invertSelection() {
    const before = this.selection.state;
    const after = invertedState(this.drawing, before);
    this.history.push(selectionEdit(this.selection, "Invert selection", before, after));
  }

  /**
   * The layer whose pixels the edit commands change: the floating content's, or else the
   * active layer, unless it is locked (or alpha-locked, for what would make pixels
   * transparent).
   */
  editableLayer(clears = false): ReadonlyLayer | null {
    const { floating } = this.selection;
    if (floating) return this.drawing.getLayer(floating.layerId);
    const layer = this.activeLayer;
    if (!layer || layer.locked || (clears && layer.alphaLocked)) return null;
    return layer;
  }

  /** Makes the selected pixels transparent: the whole layer if nothing is selected. */
  clear(label = "Delete") {
    const before = this.selection.state;
    const { floating } = before;
    if (floating) {
      // The content goes, the selection stays where it was shown.
      const { layerId, base } = floating;
      const pixels = changedTiles(layerId, layerTiles(this.drawing, layerId), base);
      const after = appliedState(this.drawing, before);
      this.history.push(selectionEdit(this.selection, label, before, after, pixels));
      return;
    }
    const layer = this.editableLayer(true);
    if (!layer) return;
    const rect = before.rect ?? this.canvas;
    const data = layer.tiles.readRegion(rect);
    if (before.shape) {
      const mask = shapeMask(rect, before.shape);
      for (let i = 0; i < mask.length; i++) if (mask[i]) data.fill(0, i * 4, i * 4 + 4);
    } else {
      data.fill(0);
    }
    this.history.push(writePixels(layer.id, rect, data, label));
  }

  /**
   * The selected pixels as they are shown (floating content transformed), or the whole
   * active layer if nothing is selected, and where they are. Null without a layer.
   */
  copyImage(): (Image & { rect: Rect }) | null {
    const { state } = this.selection;
    if (state.floating) {
      const { rect, pixels } = floatingImage(state.floating, placementOf(state)!);
      return { rect, pixels, width: rect.width, height: rect.height };
    }
    const layer = this.activeLayer;
    if (!layer) return null;
    const rect = state.rect ?? this.canvas;
    const pixels = layer.tiles.readRegion(rect);
    if (state.shape) {
      const mask = shapeMask(rect, state.shape);
      for (let i = 0; i < mask.length; i++) if (!mask[i]) pixels.fill(0, i * 4, i * 4 + 4);
    }
    return { rect, pixels, width: rect.width, height: rect.height };
  }

  /**
   * Selects the pixels of a layer (the active one by default) that are not transparent.
   * False if there are none.
   */
  selectLayerContent(id = this.activeLayer?.id): boolean {
    if (!id) return false;
    const pixels = this.drawing.getLayer(id).tiles.readRegion(this.canvas);
    const mask = new Uint8Array(pixels.length / 4);
    for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] > 0 ? 1 : 0;
    const after = selectionOfMask(this.canvas, mask);
    if (!after.rect) return false;
    const before = this.selection.state;
    this.history.push(selectionEdit(this.selection, "Select layer content", before, after));
    return true;
  }

  /**
   * Lifts the selected pixels (the whole layer if nothing is selected), to transform them
   * with the selection's handles. The selection first shrinks to what is drawn in it: the
   * handles go around the drawing, not the empty canvas. False if they can't be lifted (no
   * layer, a locked one), or there is nothing drawn there.
   */
  transform(): boolean {
    const before = this.selection.state;
    if (before.floating) return true;
    const area = this.drawnArea();
    if (!area) return false;
    const lifted = this.lifted(area);
    if (!lifted) return false;
    const { state, pixels } = lifted;
    this.history.push(selectionEdit(this.selection, "Transform", before, state, pixels));
    return true;
  }

  /**
   * Mirrors the selected pixels in place, or the whole layer if nothing is selected (then
   * laid at once: no selection is left).
   */
  flip(axis: "horizontal" | "vertical") {
    const before = this.selection.state;
    const layerId = this.editableLayer()?.id;
    if (!layerId) return;
    const start = layerTiles(this.drawing, layerId);
    let state = before.floating ? before : this.lifted()?.state;
    if (!state?.floating) return;
    // Across the middle of its box.
    const shown = placementOf(state)!;
    const next = mirrored(
      shown,
      axis === "horizontal" ? shown.x + shown.width / 2 : null,
      axis === "vertical" ? shown.y + shown.height / 2 : null,
    );
    showFloating(this.drawing, state.floating, shown, next);
    const { x, y, width, height, transform } = next;
    state = { ...state, rect: { x, y, width, height }, transform };
    const after = before.rect ? state : NO_SELECTION;
    const pixels = changedTiles(layerId, start, layerTiles(this.drawing, layerId));
    const label = axis === "horizontal" ? "Flip horizontally" : "Flip vertically";
    this.history.push(selectionEdit(this.selection, label, before, after, pixels));
  }

  /**
   * Puts an image in the active layer at `at`, floating: the selection's handles move and
   * scale it, and Enter lays it. False without a layer, or with a locked one.
   */
  paste(image: Image, at: { x: number; y: number }): boolean {
    const before = this.selection.state;
    const layer = this.activeLayer;
    if (!layer || layer.locked) return false;
    const start = layerTiles(this.drawing, layer.id);
    const rect = { x: at.x, y: at.y, width: image.width, height: image.height };
    const floating: Floating = {
      layerId: layer.id,
      pixels: image.pixels,
      width: image.width,
      height: image.height,
      origin: rect,
      original: start,
      base: start,
    };
    showFloating(this.drawing, floating, rect, rect);
    const after: SelectionState = { rect, floating };
    const pixels = changedTiles(layer.id, start, layerTiles(this.drawing, layer.id));
    this.history.push(selectionEdit(this.selection, "Paste", before, after, pixels));
    return true;
  }

  /** Puts an image in a new layer above the active one, at `at`, cut to the canvas. */
  pasteAsLayer(image: Image, at: { x: number; y: number }) {
    const { drawing } = this;
    const active = this.activeLayer;
    const index = active ? drawing.indexOf(active.id) + 1 : drawing.layers.length;
    const layer = drawing.createLayer({ name: `Layer ${drawing.layers.length + 1}` });
    const edits = [addLayer(layer, index)];
    const from = { x: at.x, y: at.y, width: image.width, height: image.height };
    const rect = intersect(from, this.canvas);
    if (rect) edits.push(writePixels(layer.id, rect, cropped(image, from, rect)));
    this.history.push(group("Paste as new layer", edits));
    this.setActiveLayer(layer.id);
  }

  /**
   * The selection (or the whole canvas) cut down to the rectangle around what is drawn in it
   * on the active layer, keeping its shape there. Null if nothing is.
   */
  private drawnArea(): SelectionState | null {
    const layer = this.activeLayer;
    if (!layer) return null;
    const { rect: selected, shape } = this.selection.state;
    const rect = selected ?? this.canvas;
    const pixels = layer.tiles.readRegion(rect);
    const inside = shape ? shapeMask(rect, shape) : null;
    const drawn = new Uint8Array(rect.width * rect.height);
    for (let i = 0; i < drawn.length; i++) {
      drawn[i] = (!inside || inside[i]) && pixels[i * 4 + 3] > 0 ? 1 : 0;
    }
    const around = selectionOfMask(rect, drawn).rect;
    if (!around) return null;
    // The selection's own shape in that rectangle, not the drawing's: what is transparent in
    // it is lifted too, harmlessly.
    if (!inside) return { ...this.selection.state, rect: around, floating: null };
    const mask = new Uint8Array(around.width * around.height);
    for (let y = 0; y < around.height; y++) {
      const from = (around.y - rect.y + y) * rect.width + (around.x - rect.x);
      mask.set(inside.subarray(from, from + around.width), y * around.width);
    }
    return {
      ...this.selection.state,
      rect: around,
      shape: shapeOf(mask, around.width, around.height),
    };
  }

  /** Floating content of the active layer, lifted from the selection or the whole layer. */
  private lifted(
    from: SelectionState = this.selection.state,
  ): { state: SelectionState; pixels: ReturnType<typeof changedTiles> } | null {
    const before = from;
    const layer = this.editableLayer();
    if (!layer || !layer.visible) return null;
    const rect = before.rect ?? this.canvas;
    const mask = before.shape ? shapeMask(rect, before.shape) : null;
    const floating = lift(this.drawing, layer.id, rect, mask);
    showFloating(this.drawing, floating, rect, rect);
    const state = { rect, shape: before.shape, floating, pivot: before.pivot };
    const pixels = changedTiles(layer.id, floating.original, layerTiles(this.drawing, layer.id));
    return { state, pixels };
  }

  private get canvas(): Rect {
    return { x: 0, y: 0, width: this.drawing.width, height: this.drawing.height };
  }

  private setActiveId(id: string | null) {
    if (id === this.activeId) return;
    this.activeId = id;
    this.activeChanges.emit(id);
  }

  private keepActiveLayerValid() {
    const layers = this.drawing.layers;
    const index = layers.findIndex((l) => l.id === this.activeId);
    if (index >= 0) {
      this.activeIndex = index;
      return;
    }
    if (layers.length === 0) {
      this.setActiveId(null);
      return;
    }
    this.activeIndex = Math.min(this.activeIndex, layers.length - 1);
    this.setActiveId(layers[this.activeIndex].id);
  }
}

/** The pixels of `rect`, inside `from`, of an image covering `from`. */
function cropped(image: Image, from: Rect, rect: Rect): Uint8ClampedArray {
  if (rect.width === from.width && rect.height === from.height) return image.pixels;
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y - from.y + y) * from.width + (rect.x - from.x)) * 4;
    out.set(image.pixels.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return out;
}
