// Editor commands: layers, selection, edits of pixels and history. Without an explicit `id`, layer commands target the
// active layer, so they can be bound to shortcuts or the quick wheel without params.

import { m } from "#lib/paraglide/messages.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Drawing } from "#lib/core/document/drawing.js";
import { moveLayer, removeLayer, updateLayer } from "#lib/core/history/edits.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { LayerProps } from "#lib/core/document/layer.js";
import {
  crop,
  flipImage,
  resizeCanvas,
  rotateImage,
  scaleImage,
  selectionBounds,
  trim,
} from "#lib/core/editor/image-edits.js";
import {
  clearLayer,
  duplicateLayer,
  flatten,
  flipLayer,
  mergeDown,
  mergeTarget,
} from "#lib/core/editor/layer-edits.js";

const exists = (d: Drawing, id: string | undefined): id is string =>
  id !== undefined && d.layers.some((l) => l.id === id);

const target = (editor: Editor, id?: string) => id ?? editor.activeLayer?.id;

/** Pixels can be lifted (or are): floating content, or a visible layer that isn't locked. */
export const movable = (editor: Editor) =>
  editor.selection.floating !== null || editor.editableLayer()?.visible === true;

/** Registers the editor commands. */
export function registerEditorCommands(registry: CommandRegistry<Editor>) {
  registry.register({
    id: "selection.apply",
    title: m.cmd_selection_apply(),
    enabled: (editor) => editor.selection.floating !== null,
    run: (editor) => editor.applySelection(),
  });
  registry.register({
    id: "selection.cancel",
    title: m.cmd_selection_cancel(),
    enabled: (editor) => editor.selection.rect !== null,
    run: (editor) => editor.cancelSelection(),
  });
  registry.register({
    id: "selection.deselect",
    title: m.cmd_selection_deselect(),
    enabled: (editor) => editor.selection.rect !== null,
    run: (editor) => editor.deselect(),
  });

  registry.register({
    id: "selection.selectAll",
    title: m.cmd_selection_select_all(),
    run: (editor) => editor.selectAll(),
  });
  registry.register<{ id?: string } | undefined>({
    id: "selection.layerContent",
    title: m.cmd_selection_layer_content(),
    enabled: (editor, params) => exists(editor.drawing, target(editor, params?.id)),
    run: (editor, params) => void editor.selectLayerContent(target(editor, params?.id)),
  });
  registry.register({
    id: "selection.invert",
    title: m.cmd_selection_invert(),
    run: (editor) => editor.invertSelection(),
  });

  registry.register({
    id: "edit.clear",
    title: m.cmd_edit_clear(),
    enabled: (editor) => editor.editableLayer(true) !== null,
    run: (editor) => editor.clear(),
  });
  (
    [
      ["edit.flipHorizontal", m.cmd_edit_flip_horizontal(), "horizontal"],
      ["edit.flipVertical", m.cmd_edit_flip_vertical(), "vertical"],
    ] as const
  ).forEach(([commandId, title, axis]) =>
    registry.register({
      id: commandId,
      title,
      enabled: (editor) => movable(editor),
      run: (editor) => editor.flip(axis),
    }),
  );

  registry.register<{ index?: number; props?: Partial<LayerProps> } | undefined>({
    id: "layer.add",
    title: m.cmd_layer_add(),
    run: (editor, params) => editor.addLayer(params?.props, params?.index),
  });

  registry.register<{ id?: string } | undefined>({
    id: "layer.remove",
    title: m.cmd_layer_remove(),
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
  });

  registry.register<{ id?: string; index: number }>({
    id: "layer.move",
    title: m.cmd_layer_move(),
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
  });

  (
    [
      ["layer.moveUp", m.cmd_layer_move_up(), 1],
      ["layer.moveDown", m.cmd_layer_move_down(), -1],
    ] as const
  ).forEach(([commandId, title, step]) =>
    registry.register<{ id?: string } | undefined>({
      id: commandId,
      title,
      enabled(editor, params) {
        const { drawing } = editor;
        const id = target(editor, params?.id);
        if (!exists(drawing, id)) {
          return false;
        }
        const index = drawing.indexOf(id) + step;
        return index >= 0 && index < drawing.layers.length;
      },
      run(editor, params) {
        const id = target(editor, params?.id)!;
        editor.history.push(moveLayer(id, editor.drawing.indexOf(id) + step));
      },
    }),
  );

  registry.register<{ id?: string; changes: Partial<LayerProps> }>({
    id: "layer.update",
    title: m.cmd_layer_update(),
    needsParams: true,
    enabled: (editor, { id }) => exists(editor.drawing, target(editor, id)),
    run(editor, { id, changes }) {
      const layerId = target(editor, id)!;
      // Showing or hiding a layer is not an undo step.
      const { visible, ...undoable } = changes;
      if (Object.keys(undoable).length > 0) {
        editor.history.push(updateLayer(layerId, undoable));
      }
      if (visible !== undefined) {
        editor.drawing.updateLayer(layerId, { visible });
      }
    },
  });

  registry.register<{ id?: string } | undefined>({
    id: "layer.duplicate",
    title: m.cmd_layer_duplicate(),
    enabled: (editor, params) => exists(editor.drawing, target(editor, params?.id)),
    run: (editor, params) => duplicateLayer(editor, target(editor, params?.id)!),
  });
  registry.register<{ id?: string } | undefined>({
    id: "layer.mergeDown",
    title: m.cmd_layer_merge_down(),
    enabled(editor, params) {
      const id = target(editor, params?.id);
      return exists(editor.drawing, id) && mergeTarget(editor, id) !== null;
    },
    run: (editor, params) => mergeDown(editor, target(editor, params?.id)!),
  });
  registry.register({
    id: "layer.flatten",
    title: m.cmd_layer_flatten(),
    enabled: (editor) => editor.drawing.layers.length > 1,
    run: (editor) => flatten(editor),
  });
  registry.register<{ id?: string } | undefined>({
    id: "layer.clear",
    title: m.cmd_layer_clear(),
    enabled: (editor, params) => {
      const id = target(editor, params?.id);
      if (!exists(editor.drawing, id)) {
        return false;
      }
      const layer = editor.drawing.getLayer(id);
      return !layer.locked && !layer.alphaLocked;
    },
    run: (editor, params) => clearLayer(editor, target(editor, params?.id)!),
  });
  (
    [
      ["layer.flipHorizontal", m.cmd_layer_flip_horizontal(), "horizontal"],
      ["layer.flipVertical", m.cmd_layer_flip_vertical(), "vertical"],
    ] as const
  ).forEach(([commandId, title, axis]) =>
    registry.register<{ id?: string } | undefined>({
      id: commandId,
      title,
      enabled: (editor, params) => {
        const id = target(editor, params?.id);
        return exists(editor.drawing, id) && !editor.drawing.getLayer(id).locked;
      },
      run: (editor, params) => flipLayer(editor, target(editor, params?.id)!, axis),
    }),
  );

  registry.register<{ id: string }>({
    id: "layer.select",
    title: m.cmd_layer_select(),
    needsParams: true,
    enabled: (editor, { id }) => exists(editor.drawing, id),
    run: (editor, { id }) => editor.setActiveLayer(id),
  });

  (
    [
      ["layer.selectAbove", m.cmd_layer_select_above(), 1],
      ["layer.selectBelow", m.cmd_layer_select_below(), -1],
    ] as const
  ).forEach(([commandId, title, step]) =>
    registry.register({
      id: commandId,
      title,
      enabled(editor) {
        const active = editor.activeLayer;
        if (!active) {
          return false;
        }
        const index = editor.drawing.indexOf(active.id) + step;
        return index >= 0 && index < editor.drawing.layers.length;
      },
      run(editor) {
        const index = editor.drawing.indexOf(editor.activeLayer!.id) + step;
        editor.setActiveLayer(editor.drawing.layers[index].id);
      },
    }),
  );

  registry.register<{ width: number; height: number; dx: number; dy: number }>({
    id: "image.resizeCanvas",
    title: m.cmd_image_resize_canvas(),
    needsParams: true,
    run: (editor, { width, height, dx, dy }) => resizeCanvas(editor, width, height, dx, dy),
  });
  registry.register<{ width: number; height: number; smooth: boolean }>({
    id: "image.scale",
    title: m.cmd_image_scale(),
    needsParams: true,
    run: (editor, { width, height, smooth }) => scaleImage(editor, width, height, smooth),
  });
  registry.register({
    id: "image.cropToSelection",
    title: m.cmd_image_crop_to_selection(),
    enabled: (editor) => editor.selection.rect !== null,
    run(editor) {
      const rect = selectionBounds(editor);
      if (rect) {
        crop(editor, rect, m.cmd_image_crop_to_selection());
      }
    },
  });
  registry.register({
    id: "image.trim",
    title: m.cmd_image_trim(),
    enabled: (editor) => editor.drawing.layers.some((l) => l.tiles.tileCount > 0),
    run: (editor) => void trim(editor),
  });
  (
    [
      ["image.rotateLeft", m.cmd_image_rotate_left(), 3],
      ["image.rotateRight", m.cmd_image_rotate_right(), 1],
      ["image.rotate180", m.cmd_image_rotate180(), 2],
    ] as const
  ).forEach(([commandId, title, quarters]) =>
    registry.register({ id: commandId, title, run: (editor) => rotateImage(editor, quarters) }),
  );
  (
    [
      ["image.flipHorizontal", m.cmd_image_flip_horizontal(), "horizontal"],
      ["image.flipVertical", m.cmd_image_flip_vertical(), "vertical"],
    ] as const
  ).forEach(([commandId, title, axis]) =>
    registry.register({ id: commandId, title, run: (editor) => flipImage(editor, axis) }),
  );

  registry.register({
    id: "history.undo",
    title: m.cmd_history_undo(),
    enabled: (editor) => editor.history.canUndo,
    run: (editor) => editor.history.undo(),
  });

  registry.register({
    id: "history.redo",
    title: m.cmd_history_redo(),
    enabled: (editor) => editor.history.canRedo,
    run: (editor) => editor.history.redo(),
  });
}
