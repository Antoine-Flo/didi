// Built-in shortcuts. Plain data, so a user keymap file can replace it later.

import type { Keymap } from "./keymap";

export const DEFAULT_KEYMAP: Keymap = {
  version: 1,
  bindings: [
    { keys: "ctrl+z", command: "history.undo" },
    { keys: "ctrl+shift+z", command: "history.redo" },
    { keys: "ctrl+y", command: "history.redo" },

    { keys: "ctrl+k", command: "app.commandPalette" },
    { keys: "ctrl+shift+p", command: "app.commandPalette" },
    { keys: "ctrl+n", command: "file.new" },
    { keys: "ctrl+o", command: "file.open" },
    { keys: "ctrl+s", command: "file.save" },
    { keys: "ctrl+shift+s", command: "file.saveAs" },
    { keys: "ctrl+shift+e", command: "file.exportPng" },
    { keys: "ctrl+i", command: "file.importImage" },

    { keys: "b", command: "tool.brush" },
    { keys: "e", command: "tool.eraser" },
    { keys: "p", command: "tool.pixel" },
    { keys: "i", command: "tool.picker" },
    { keys: "]", command: "brush.grow" },
    { keys: "[", command: "brush.shrink" },

    { keys: "ctrl+shift+n", command: "layer.add" },

    { keys: "0", command: "view.fit" },
    { keys: "1", command: "view.actualSize" },
    { keys: "+", command: "view.zoomIn" },
    { keys: "=", command: "view.zoomIn" },
    { keys: "-", command: "view.zoomOut" },
    { keys: "4", command: "view.rotateLeft" },
    { keys: "6", command: "view.rotateRight" },
    { keys: "5", command: "view.resetRotation" },
  ],
};
