// Editor commands: layers and history. Without an explicit `id`, layer commands target the
// active layer, so they can be bound to shortcuts or the quick wheel without params.

import type { CommandRegistry } from "./commands";
import type { Drawing } from "../document/drawing";
import { addLayer, moveLayer, removeLayer, updateLayer } from "../history/edits";
import type { Editor } from "./editor";
import type { LayerProps } from "../document/layer";

const exists = (d: Drawing, id: string | undefined): id is string =>
  id !== undefined && d.layers.some((l) => l.id === id);

const target = (editor: Editor, id?: string) => id ?? editor.activeLayer?.id;

/** Registers the editor commands. Returns a function that unregisters them. */
export function registerEditorCommands(registry: CommandRegistry<Editor>): () => void {
  const unregister = [
    registry.register<{ index?: number; props?: Partial<LayerProps> } | undefined>({
      id: "layer.add",
      title: "New layer",
      run(editor, params) {
        const { drawing } = editor;
        const active = editor.activeLayer;
        // Above the active layer by default.
        const index =
          params?.index ?? (active ? drawing.indexOf(active.id) + 1 : drawing.layers.length);
        const layer = drawing.createLayer({
          name: `Layer ${drawing.layers.length + 1}`,
          ...params?.props,
        });
        editor.history.push(addLayer(layer, index));
        editor.setActiveLayer(layer.id);
      },
    }),

    registry.register<{ id?: string } | undefined>({
      id: "layer.remove",
      title: "Delete layer",
      enabled: (editor, params) => exists(editor.drawing, target(editor, params?.id)),
      run(editor, params) {
        const { drawing } = editor;
        const id = target(editor, params?.id)!;
        const index = drawing.indexOf(id);
        const wasActive = id === editor.activeLayer?.id;
        editor.history.push(removeLayer(id));
        // Select the layer below, like most drawing apps.
        if (wasActive && drawing.layers.length > 0) {
          editor.setActiveLayer(drawing.layers[Math.max(0, index - 1)].id);
        }
      },
    }),

    registry.register<{ id?: string; index: number }>({
      id: "layer.move",
      title: "Move layer",
      needsParams: true,
      enabled(editor, { id, index }) {
        const { drawing } = editor;
        const layerId = target(editor, id);
        return (
          exists(drawing, layerId) &&
          Number.isInteger(index) &&
          index >= 0 &&
          index < drawing.layers.length &&
          drawing.indexOf(layerId) !== index
        );
      },
      run: (editor, { id, index }) => editor.history.push(moveLayer(target(editor, id)!, index)),
    }),

    ...(
      [
        ["layer.moveUp", "Move layer up", 1],
        ["layer.moveDown", "Move layer down", -1],
      ] as const
    ).map(([commandId, title, step]) =>
      registry.register<{ id?: string } | undefined>({
        id: commandId,
        title,
        enabled(editor, params) {
          const { drawing } = editor;
          const id = target(editor, params?.id);
          if (!exists(drawing, id)) return false;
          const index = drawing.indexOf(id) + step;
          return index >= 0 && index < drawing.layers.length;
        },
        run(editor, params) {
          const id = target(editor, params?.id)!;
          editor.history.push(moveLayer(id, editor.drawing.indexOf(id) + step));
        },
      }),
    ),

    registry.register<{ id?: string; changes: Partial<LayerProps> }>({
      id: "layer.update",
      title: "Edit layer",
      needsParams: true,
      enabled: (editor, { id }) => exists(editor.drawing, target(editor, id)),
      run: (editor, { id, changes }) =>
        editor.history.push(updateLayer(target(editor, id)!, changes)),
    }),

    registry.register<{ id: string }>({
      id: "layer.select",
      title: "Select layer",
      needsParams: true,
      enabled: (editor, { id }) => exists(editor.drawing, id),
      run: (editor, { id }) => editor.setActiveLayer(id),
    }),

    ...(
      [
        ["layer.selectAbove", "Select layer above", 1],
        ["layer.selectBelow", "Select layer below", -1],
      ] as const
    ).map(([commandId, title, step]) =>
      registry.register({
        id: commandId,
        title,
        enabled(editor) {
          const active = editor.activeLayer;
          if (!active) return false;
          const index = editor.drawing.indexOf(active.id) + step;
          return index >= 0 && index < editor.drawing.layers.length;
        },
        run(editor) {
          const index = editor.drawing.indexOf(editor.activeLayer!.id) + step;
          editor.setActiveLayer(editor.drawing.layers[index].id);
        },
      }),
    ),

    registry.register({
      id: "history.undo",
      title: "Undo",
      enabled: (editor) => editor.history.canUndo,
      run: (editor) => editor.history.undo(),
    }),

    registry.register({
      id: "history.redo",
      title: "Redo",
      enabled: (editor) => editor.history.canRedo,
      run: (editor) => editor.history.redo(),
    }),
  ];
  return () => unregister.forEach((fn) => fn());
}
