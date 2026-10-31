// Undoable changes to a drawing.
//
// An edit is created unapplied. `apply` performs it (and redoes it), `revert` undoes it.
// `revert` must only be called after `apply`, and calls must alternate.

import type { Drawing } from "./drawing";
import type { Rect } from "./geometry";
import type { Layer, LayerProps } from "./layer";
import type { TileSnapshot } from "./tiles";

export interface Edit {
  /** Shown in the history, e.g. "Ajouter un calque". */
  readonly label: string;
  apply(drawing: Drawing): void;
  revert(drawing: Drawing): void;
}

/** Adds a layer at `index`, on top by default. */
export function addLayer(layer: Layer, index?: number): Edit {
  let at = index;
  return {
    label: "Ajouter un calque",
    apply(d) {
      at ??= d.layers.length;
      d.addLayer(layer, at);
    },
    revert(d) {
      d.removeLayer(layer.id);
    },
  };
}

export function removeLayer(id: string): Edit {
  let removed: ReturnType<Drawing["removeLayer"]>;
  return {
    label: "Supprimer le calque",
    apply(d) {
      removed = d.removeLayer(id);
    },
    revert(d) {
      d.addLayer(removed.layer, removed.index);
    },
  };
}

export function moveLayer(id: string, index: number): Edit {
  let from: number;
  return {
    label: "Déplacer le calque",
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
    label: "Modifier le calque",
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
  label = "Peindre",
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
  };
}
