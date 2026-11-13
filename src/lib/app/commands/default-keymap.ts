// Built-in shortcuts. Plain data, so a user keymap file can replace it later.

import type { Binding, Keymap } from "#lib/app/commands/keymap.js";

/** Added in a browser, over the others: nothing is saved there, Ctrl+S exports. */
export const BROWSER_BINDINGS: Binding[] = [{ keys: "ctrl+s", command: "file.exportPng" }];

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
    { keys: "ctrl+q", command: "app.quit" },
    { keys: "ctrl+,", command: "app.preferences" },

    // Like Aseprite: B is the pencil, E the eraser, G the paint bucket, L the line, U the
    // rectangle, Shift+U the ellipse, M the rectangle selection and Q the lasso.
    { keys: "b", command: "tool.pixel" },
    { keys: "p", command: "tool.pixel" },
    { keys: "e", command: "tool.pixelEraser" },
    { keys: "g", command: "tool.fill" },
    { keys: "l", command: "tool.line" },
    { keys: "u", command: "tool.rectangle" },
    { keys: "shift+u", command: "tool.ellipse" },
    { keys: "m", command: "selection.rectangle" },
    { keys: "q", command: "selection.lasso" },
    { keys: "i", command: "tool.picker" },
    { keys: "x", command: "color.swap" },
    { keys: "]", command: "brush.grow" },
    { keys: "[", command: "brush.shrink" },

    { keys: "ctrl+shift+n", command: "layer.add" },
    { keys: "ctrl+j", command: "layer.duplicate" },
    { keys: "ctrl+e", command: "layer.mergeDown" },

    { keys: "enter", command: "selection.apply" },
    { keys: "escape", command: "selection.cancel" },
    { keys: "ctrl+d", command: "selection.deselect" },
    { keys: "ctrl+a", command: "selection.selectAll" },
    { keys: "ctrl+shift+i", command: "selection.invert" },

    { keys: "ctrl+x", command: "edit.cut" },
    { keys: "ctrl+c", command: "edit.copy" },
    { keys: "ctrl+v", command: "edit.paste" },
    { keys: "ctrl+shift+v", command: "edit.pasteAsLayer" },
    { keys: "delete", command: "edit.clear" },
    { keys: "backspace", command: "edit.clear" },
    { keys: "ctrl+t", command: "edit.transform" },

    { keys: "ctrl+alt+c", command: "image.canvasSize" },
    { keys: "ctrl+alt+i", command: "image.imageSize" },

    { keys: "0", command: "view.fit" },
    { keys: "1", command: "view.actualSize" },
    { keys: "+", command: "view.zoomIn" },
    { keys: "=", command: "view.zoomIn" },
    { keys: "-", command: "view.zoomOut" },
    { keys: "4", command: "view.rotateLeft" },
    { keys: "6", command: "view.rotateRight" },
    { keys: "5", command: "view.resetRotation" },
    { keys: "ctrl+b", command: "view.togglePanels" },
    { keys: "h", command: "view.mirror" },
    { keys: "ctrl+'", command: "view.pixelGrid" },
    { keys: "tab", command: "view.hideInterface" },
    { keys: "f11", command: "view.fullScreen" },
    { keys: "ctrl+/", command: "app.shortcuts" },
  ],
};
