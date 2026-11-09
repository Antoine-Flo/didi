// Undoable changes to a drawing.
//
// An edit is created unapplied. `apply` performs it (and redoes it), `revert` undoes it.
// `revert` must only be called after `apply`, and calls must alternate.

import { m } from "#lib/paraglide/messages.js";
import type { Drawing } from "#lib/core/document/drawing.js";
import type { Rect } from "#lib/core/shared/geometry.js";
import type { Layer, LayerProps } from "#lib/core/document/layer.js";
import { TILE_SIZE, type TileSnapshot } from "#lib/core/document/tiles.js";

export interface Edit {
  /** Shown in the history, e.g. "Add layer". */
  readonly label: string;
  apply(drawing: Drawing): void;
  revert(drawing: Drawing): void;
  /** Estimate of the memory this edit can keep alive, in bytes. Defaults to 0. */
  bytes?(): number;
  /**
   * The edit changes something else than the drawing (e.g. a palette), undone with it: not
   * an unsaved change of the document.
   */
  readonly outsideDrawing?: boolean;
}

const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;

function snapshotBytes(snapshot: TileSnapshot | undefined): number {
  let count = 0;
  for (const tile of snapshot?.values() ?? []) {
    if (tile) {
      count++;
    }
  }
  return count * TILE_BYTES;
}

/** Several edits undone and redone as one step. */
export function group(label: string, edits: readonly Edit[]): Edit {
  return {
    label,
    apply(d) {
      for (const edit of edits) {
        edit.apply(d);
      }
    },
    revert(d) {
      for (let i = edits.length - 1; i >= 0; i--) {
        edits[i].revert(d);
      }
    },
    bytes: () => edits.reduce((sum, edit) => sum + (edit.bytes?.() ?? 0), 0),
    outsideDrawing: edits.every((edit) => edit.outsideDrawing),
  };
}

/** Adds a layer at `index`, on top by default. */
export function addLayer(layer: Layer, index?: number): Edit {
  let at = index;
  return {
    label: m.history_add_layer(),
    apply(d) {
      at ??= d.layers.length;
      d.addLayer(layer, at);
    },
    revert(d) {
      d.removeLayer(layer.id);
    },
    bytes: () => layer.tiles.memoryBytes,
  };
}

export function removeLayer(id: string): Edit {
  let removed: ReturnType<Drawing["removeLayer"]>;
  return {
    label: m.cmd_layer_remove(),
    apply(d) {
      removed = d.removeLayer(id);
    },
    revert(d) {
      d.addLayer(removed.layer, removed.index);
    },
    bytes: () => removed?.layer.tiles.memoryBytes ?? 0,
  };
}

export function moveLayer(id: string, index: number): Edit {
  let from: number;
  return {
    label: m.cmd_layer_move(),
    apply(d) {
      from = d.moveLayer(id, index);
    },
    revert(d) {
      d.moveLayer(id, from);
    },
  };
}

export function updateLayer(id: string, changes: Partial<LayerProps>): Edit {
  let previous: Partial<LayerProps>;
  return {
    label: m.cmd_layer_update(),
    apply(d) {
      previous = d.updateLayer(id, changes);
    },
    revert(d) {
      d.updateLayer(id, previous);
    },
  };
}

/**
 * Writes pixels into a layer. Only the touched tiles are kept, before and after;
 * the raw region data is released after the first application.
 */
export function writePixels(
  id: string,
  rect: Rect,
  data: Uint8ClampedArray,
  label = m.history_paint(),
): Edit {
  let pending: Uint8ClampedArray | null = data;
  let before: TileSnapshot;
  let after: TileSnapshot;
  return {
    label,
    apply(d) {
      if (pending) {
        before = d.writePixels(id, rect, pending);
        after = d.getLayer(id).tiles.snapshot(before.keys());
        pending = null;
      } else {
        d.restorePixels(id, after);
      }
    },
    revert(d) {
      d.restorePixels(id, before);
    },
    bytes: () => snapshotBytes(before) + snapshotBytes(after),
  };
}

/**
 * Replaces tiles of a layer, from `before` to `after`. Used for changes already made
 * progressively, like a brush stroke: applying it again is harmless.
 */
export function replaceTiles(
  id: string,
  before: TileSnapshot,
  after: TileSnapshot,
  label: string,
): Edit {
  return {
    label,
    apply(d) {
      d.restorePixels(id, after);
    },
    revert(d) {
      d.restorePixels(id, before);
    },
    bytes: () => snapshotBytes(before) + snapshotBytes(after),
  };
}
