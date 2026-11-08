// Editor commands: layers, selection, edits of pixels and history. Without an explicit `id`, layer commands target the
// active layer, so they can be bound to shortcuts or the quick wheel without params.

import type { CommandRegistry } from "./commands";
import type { Drawing } from "../document/drawing";
import { addLayer, moveLayer, removeLayer, updateLayer } from "../history/edits";
import type { Editor } from "./editor";
import type { LayerProps } from "../document/layer";
import {
  crop,
  flipImage,
  resizeCanvas,
  rotateImage,
  scaleImage,
  selectionBounds,
  trim,
} from "./image-edits";
import {
  clearLayer,
  duplicateLayer,
  flatten,
  flipLayer,
  mergeDown,
  mergeTarget,
} from "./layer-edits";

const exists = (d: Drawing, id: string | undefined): id is string =>
  id !== undefined && d.layers.some((l) => l.id === id);

const target = (editor: Editor, id?: string) => id ?? editor.activeLayer?.id;

/** Pixels can be lifted (or are): floating content, or a visible layer that isn't locked. */
export const movable = (editor: Editor) =>
  editor.selection.floating !== null || editor.editableLayer()?.visible === true;

/** Registers the editor commands. Returns a function that unregisters them. */
export function registerEditorCommands(registry: CommandRegistry<Editor>): () => void {
  const unregister = [
    registry.register({
      id: "selection.apply",
      title: "Apply selection",
      enabled: (editor) => editor.selection.floating !== null,
      run: (editor) => editor.applySelection(),
    }),
    registry.register({
      id: "selection.cancel",
      title: "Cancel selection",
      enabled: (editor) => editor.selection.rect !== null,
      run: (editor) => editor.cancelSelection(),
    }),
    registry.register({
      id: "selection.deselect",
      title: "Deselect",
      enabled: (editor) => editor.selection.rect !== null,
      run: (editor) => editor.deselect(),
    }),

    registry.register({
      id: "selection.selectAll",
      title: "Select all",
      run: (editor) => editor.selectAll(),
    }),
    registry.register<{ id?: string } | undefined>({
      id: "selection.layerContent",
      title: "Select layer content",
      enabled: (editor, params) => exists(editor.drawing, target(editor, params?.id)),
      run: (editor, params) => void editor.selectLayerContent(target(editor, params?.id)),
    }),
    registry.register({
      id: "selection.invert",
      title: "Invert selection",
      run: (editor) => editor.invertSelection(),
    }),

    registry.register({
      id: "edit.clear",
      title: "Delete",
      enabled: (editor) => editor.editableLayer(true) !== null,
      run: (editor) => editor.clear(),
    }),
    ...(
      [
        ["edit.flipHorizontal", "Flip horizontally", "horizontal"],
        ["edit.flipVertical", "Flip vertically", "vertical"],
      ] as const
    ).map(([commandId, title, axis]) =>
      registry.register({
        id: commandId,
        title,
        enabled: (editor) => movable(editor),
        run: (editor) => editor.flip(axis),
      }),
    ),

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
      run(editor, { id, changes }) {
        const layerId = target(editor, id)!;
        // Showing or hiding a layer is not an undo step.
        const { visible, ...undoable } = changes;
        if (Object.keys(undoable).length > 0) {
          editor.history.push(updateLayer(layerId, undoable));
        }
        if (visible !== undefined) editor.drawing.updateLayer(layerId, { visible });
      },
    }),

    registry.register<{ id?: string } | undefined>({
      id: "layer.duplicate",
      title: "Duplicate layer",
      enabled: (editor, params) => exists(editor.drawing, target(editor, params?.id)),
      run: (editor, params) => duplicateLayer(editor, target(editor, params?.id)!),
    }),
    registry.register<{ id?: string } | undefined>({
      id: "layer.mergeDown",
      title: "Merge down",
      enabled(editor, params) {
        const id = target(editor, params?.id);
        return exists(editor.drawing, id) && mergeTarget(editor, id) !== null;
      },
      run: (editor, params) => mergeDown(editor, target(editor, params?.id)!),
    }),
    registry.register({
      id: "layer.flatten",
      title: "Flatten image",
      enabled: (editor) => editor.drawing.layers.length > 1,
      run: (editor) => flatten(editor),
    }),
    registry.register<{ id?: string } | undefined>({
      id: "layer.clear",
      title: "Clear layer",
      enabled: (editor, params) => {
        const id = target(editor, params?.id);
        if (!exists(editor.drawing, id)) return false;
        const layer = editor.drawing.getLayer(id);
        return !layer.locked && !layer.alphaLocked;
      },
      run: (editor, params) => clearLayer(editor, target(editor, params?.id)!),
    }),
    ...(
      [
        ["layer.flipHorizontal", "Flip layer horizontally", "horizontal"],
        ["layer.flipVertical", "Flip layer vertically", "vertical"],
      ] as const
    ).map(([commandId, title, axis]) =>
      registry.register<{ id?: string } | undefined>({
        id: commandId,
        title,
        enabled: (editor, params) => {
          const id = target(editor, params?.id);
          return exists(editor.drawing, id) && !editor.drawing.getLayer(id).locked;
        },
        run: (editor, params) => flipLayer(editor, target(editor, params?.id)!, axis),
      }),
    ),

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

    registry.register<{ width: number; height: number; dx: number; dy: number }>({
      id: "image.resizeCanvas",
      title: "Resize canvas",
      needsParams: true,
      run: (editor, { width, height, dx, dy }) => resizeCanvas(editor, width, height, dx, dy),
    }),
    registry.register<{ width: number; height: number; smooth: boolean }>({
      id: "image.scale",
      title: "Scale image",
      needsParams: true,
      run: (editor, { width, height, smooth }) => scaleImage(editor, width, height, smooth),
    }),
    registry.register({
      id: "image.cropToSelection",
      title: "Crop to selection",
      enabled: (editor) => editor.selection.rect !== null,
      run(editor) {
        const rect = selectionBounds(editor);
        if (rect) crop(editor, rect, "Crop to selection");
      },
    }),
    registry.register({
      id: "image.trim",
      title: "Trim",
      enabled: (editor) => editor.drawing.layers.some((l) => l.tiles.tileCount > 0),
      run: (editor) => void trim(editor),
    }),
    ...(
      [
        ["image.rotateLeft", "Rotate left", 3],
        ["image.rotateRight", "Rotate right", 1],
        ["image.rotate180", "Rotate 180°", 2],
      ] as const
    ).map(([commandId, title, quarters]) =>
      registry.register({ id: commandId, title, run: (editor) => rotateImage(editor, quarters) }),
    ),
    ...(
      [
        ["image.flipHorizontal", "Flip canvas horizontally", "horizontal"],
        ["image.flipVertical", "Flip canvas vertically", "vertical"],
      ] as const
    ).map(([commandId, title, axis]) =>
      registry.register({ id: commandId, title, run: (editor) => flipImage(editor, axis) }),
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
