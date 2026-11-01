// A drawing: canvas size and a stack of layers.
//
// Every mutation returns what is needed to undo it, so commands and history can be built
// on top without knowing the internals. Every mutation is also notified to subscribers,
// precisely enough for a renderer to update only what changed.

import { Emitter } from "./emitter";
import type { Rect } from "./geometry";
import {
  DEFAULT_LAYER_PROPS,
  LAYER_PROP_KEYS,
  validateLayerProps,
  type Layer,
  type LayerProps,
  type ReadonlyLayer,
} from "./layer";
import { TileStore, assertCanvasSize, tileKey, type TileSnapshot } from "./tiles";

export interface RemovedLayer {
  layer: Layer;
  index: number;
}

export type DrawingChange =
  | { type: "layer-added"; id: string; index: number }
  | { type: "layer-removed"; id: string; index: number }
  | { type: "layer-moved"; id: string; from: number; to: number }
  | { type: "layer-updated"; id: string; keys: (keyof LayerProps)[] }
  /** Keys of the tiles whose pixels changed. */
  | { type: "pixels-changed"; id: string; tiles: number[] };

export class Drawing {
  /** Layers from bottom to top. */
  private stack: Layer[] = [];
  private nextId = 1;
  private changes = new Emitter<DrawingChange>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    assertCanvasSize(width, height);
  }

  /** Layers from bottom to top. Change them only through the drawing's methods. */
  get layers(): readonly ReadonlyLayer[] {
    return this.stack;
  }

  getLayer(id: string): ReadonlyLayer {
    return this.stack[this.indexOf(id)];
  }

  /** Calls `listener` after every change. Returns a function that unsubscribes. */
  subscribe(listener: (change: DrawingChange) => void): () => void {
    return this.changes.subscribe(listener);
  }

  indexOf(id: string): number {
    const index = this.stack.findIndex((l) => l.id === id);
    if (index < 0) throw new Error(`Unknown layer ${id}`);
    return index;
  }

  /** Creates an empty layer, not yet added to the drawing. */
  createLayer(props: Partial<LayerProps> = {}): Layer {
    validateLayerProps(props);
    let id = `layer-${this.nextId++}`;
    while (this.stack.some((l) => l.id === id)) id = `layer-${this.nextId++}`;
    return {
      ...DEFAULT_LAYER_PROPS,
      ...props,
      id,
      tiles: new TileStore(this.width, this.height),
    };
  }

  /** Inserts a layer at `index` (default: on top). Undo with `removeLayer`. */
  addLayer(layer: Layer, index = this.stack.length) {
    if (this.stack.some((l) => l.id === layer.id)) {
      throw new Error(`Layer ${layer.id} already exists`);
    }
    if (layer.tiles.width !== this.width || layer.tiles.height !== this.height) {
      throw new RangeError("Layer size does not match the drawing");
    }
    assertIndex(index, this.stack.length + 1);
    validateLayerProps(layer);
    this.stack.splice(index, 0, layer);
    this.changes.emit({ type: "layer-added", id: layer.id, index });
  }

  /** Removes a layer. Undo with `addLayer(removed.layer, removed.index)`. */
  removeLayer(id: string): RemovedLayer {
    const index = this.indexOf(id);
    const [layer] = this.stack.splice(index, 1);
    this.changes.emit({ type: "layer-removed", id, index });
    return { layer, index };
  }

  /** Moves a layer to `index`. Returns its previous index, to undo. */
  moveLayer(id: string, index: number): number {
    const from = this.indexOf(id);
    assertIndex(index, this.stack.length);
    const [layer] = this.stack.splice(from, 1);
    this.stack.splice(index, 0, layer);
    if (from !== index) this.changes.emit({ type: "layer-moved", id, from, to: index });
    return from;
  }

  /** Changes layer settings. Returns the previous values of the changed settings, to undo. */
  updateLayer(id: string, changes: Partial<LayerProps>): Partial<LayerProps> {
    validateLayerProps(changes);
    const layer = this.stack[this.indexOf(id)];
    const previous: Partial<LayerProps> = {};
    for (const key of LAYER_PROP_KEYS) {
      if (changes[key] === undefined) continue;
      Object.assign(previous, { [key]: layer[key] });
      Object.assign(layer, { [key]: changes[key] });
    }
    const keys = Object.keys(previous) as (keyof LayerProps)[];
    if (keys.length > 0) this.changes.emit({ type: "layer-updated", id, keys });
    return previous;
  }

  /**
   * Writes pixels into a layer. Refused if the layer is locked.
   * Returns the tiles as they were before, to undo with `restorePixels`.
   */
  writePixels(id: string, rect: Rect, data: Uint8ClampedArray): TileSnapshot {
    const layer = this.stack[this.indexOf(id)];
    if (layer.locked) throw new Error(`Layer ${id} is locked`);
    const before = layer.tiles.snapshot(
      layer.tiles.tilesIn(rect).map(({ tx, ty }) => tileKey(tx, ty)),
    );
    const tiles = layer.tiles.writeRegion(rect, data);
    if (tiles.length > 0) this.changes.emit({ type: "pixels-changed", id, tiles });
    return before;
  }

  /**
   * Puts back tiles saved by `writePixels` or `restorePixels`, even on a locked layer:
   * history must always be able to go back. Returns the tiles as they were before.
   */
  restorePixels(id: string, snapshot: TileSnapshot): TileSnapshot {
    const tiles = this.stack[this.indexOf(id)].tiles;
    const before = tiles.snapshot(snapshot.keys());
    const keys = tiles.restore(snapshot);
    if (keys.length > 0) this.changes.emit({ type: "pixels-changed", id, tiles: keys });
    return before;
  }
}

function assertIndex(index: number, size: number) {
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw new RangeError(`Invalid layer index ${index}`);
  }
}
