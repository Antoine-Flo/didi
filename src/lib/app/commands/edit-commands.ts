// The Edit and Image commands: the clipboard, transforming the selected pixels, and the
// canvas's and image's sizes.

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { movable } from "#lib/core/editor/editor-commands.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import type { DialogOpener, Notifier } from "#lib/app/commands/app-commands.js";
import { copy, toPaste } from "#lib/app/commands/clipboard.js";
import type { ToolHost } from "#lib/app/commands/tool-commands.js";
import { selectTool } from "#lib/app/tools/select-tool.js";
import { m } from "#lib/paraglide/messages.js";

/** What the edit commands act on: pasting or transforming picks the selection's tool. */
export interface EditHost extends Pick<ToolHost, "tool">, DialogOpener, Notifier {}

/** Registers the edit and image commands. */
export function registerEditCommands(registry: CommandRegistry<Editor>, host: EditHost) {
  /** Tells the user a clipboard operation failed. */
  const failed = (what: (params: { error: string }) => string) => (e: unknown) =>
    host.notify(what({ error: errorMessage(e) }));
  /** The selection tool, whose handles move and scale floating content. */
  const selectionTool = () => {
    host.tool = selectTool.id;
  };

  // Edit: the clipboard, and transforming the selected pixels (with the selection's tool).
  registry.register({
    id: "edit.copy",
    title: m.cmd_edit_copy(),
    enabled: (editor) => editor.selection.floating !== null || editor.activeLayer !== null,
    run: (editor) => void copy(editor).catch(failed(m.error_copy_failed)),
  });
  registry.register({
    id: "edit.cut",
    title: m.cmd_edit_cut(),
    enabled: (editor) => editor.editableLayer(true) !== null,
    run(editor) {
      const done = copy(editor);
      editor.clear(m.cmd_edit_cut());
      void done.catch(failed(m.error_copy_failed));
    },
  });
  registry.register({
    id: "edit.paste",
    title: m.cmd_edit_paste(),
    enabled: (editor) => editor.activeLayer !== null && !editor.activeLayer.locked,
    run: (editor) =>
      void toPaste(editor)
        .then((paste) => {
          if (!paste) {
            return host.notify(m.app_nothing_to_paste(), "info");
          }
          if (editor.paste(paste.image, paste.at)) {
            selectionTool();
          }
        })
        .catch(failed(m.error_paste_failed)),
  });
  registry.register({
    id: "edit.pasteAsLayer",
    title: m.cmd_edit_paste_as_layer(),
    run: (editor) =>
      void toPaste(editor)
        .then((paste) => {
          if (!paste) {
            return host.notify(m.app_nothing_to_paste(), "info");
          }
          editor.pasteAsLayer(paste.image, paste.at);
        })
        .catch(failed(m.error_paste_failed)),
  });
  registry.register({
    id: "edit.transform",
    title: m.cmd_edit_transform(),
    enabled: movable,
    run(editor) {
      if (editor.transform()) {
        selectionTool();
      } else {
        host.notify(m.app_nothing_to_transform(), "info");
      }
    },
  });

  registry.register({
    id: "image.canvasSize",
    title: m.cmd_image_canvas_size(),
    run: () => host.openDialog("canvasSize"),
  });
  registry.register({
    id: "image.imageSize",
    title: m.cmd_image_image_size(),
    run: () => host.openDialog("imageSize"),
  });
}
