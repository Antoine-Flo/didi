import type { CommandRegistry } from "./commands";
import type { Drawing } from "./drawing";
import { addLayer, moveLayer, removeLayer, updateLayer } from "./edits";
import type { LayerProps } from "./layer";

export interface DrawingContext {
  drawing: Drawing;
}

const exists = (d: Drawing, id: string) => d.layers.some((l) => l.id === id);

/** Registers the layer commands. Returns a function that unregisters them. */
export function registerLayerCommands(registry: CommandRegistry<DrawingContext>): () => void {
  const unregister = [
    registry.register<{ index?: number; props?: Partial<LayerProps> } | undefined>({
      id: "layer.add",
      title: "Nouveau calque",
      run: ({ drawing }, params) => addLayer(drawing.createLayer(params?.props), params?.index),
    }),
    registry.register<{ id: string }>({
      id: "layer.remove",
      title: "Supprimer le calque",
      enabled: ({ drawing }, { id }) => exists(drawing, id),
      run: (_, { id }) => removeLayer(id),
    }),
    registry.register<{ id: string; index: number }>({
      id: "layer.move",
      title: "Déplacer le calque",
      enabled: ({ drawing }, { id, index }) =>
        exists(drawing, id) &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < drawing.layers.length &&
        drawing.indexOf(id) !== index,
      run: (_, { id, index }) => moveLayer(id, index),
    }),
    registry.register<{ id: string; changes: Partial<LayerProps> }>({
      id: "layer.update",
      title: "Modifier le calque",
      enabled: ({ drawing }, { id }) => exists(drawing, id),
      run: (_, { id, changes }) => updateLayer(id, changes),
    }),
  ];
  return () => unregister.forEach((fn) => fn());
}
