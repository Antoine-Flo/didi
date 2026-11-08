// The menus of the title bar (File, Edit…). Plain data, like the keymap: each item runs a
// command, shown with its title (unless it has a label) and its shortcut.

/** An item of a menu: a command, a submenu, or a separator line. */
export type MenuEntry =
  | {
      command: string;
      params?: unknown;
      /** Instead of the command's title. */
      label?: string;
    }
  | {
      label: string;
      items: MenuEntry[];
      /** Only shown with this command: the items may be empty for now (the recent files). */
      requires?: string;
    }
  | "separator";

export interface MenuDefinition {
  title: string;
  items: MenuEntry[];
}

/** What changes in the menus: the recent files, the names of the undo and redo steps. */
export interface MenuState {
  recent: readonly { path: string; name: string }[];
  /** E.g. "Brush" for "Undo Brush", null if there is nothing to undo. */
  undoLabel: string | null;
  redoLabel: string | null;
}

/**
 * The menus without what does not exist here, e.g. saving in a browser, and without the
 * separators that this leaves at an end of a menu or next to each other.
 */
export function availableMenus(
  menus: MenuDefinition[],
  has: (command: string) => boolean,
): MenuDefinition[] {
  const available = (items: MenuEntry[]): MenuEntry[] =>
    items
      .flatMap((e): MenuEntry[] => {
        if (e === "separator") return [e];
        if ("command" in e) return has(e.command) ? [e] : [];
        if (e.requires && !has(e.requires)) return [];
        return [{ ...e, items: available(e.items) }];
      })
      .filter((e, i, all) => e !== "separator" || (i > 0 && all[i - 1] !== "separator"));
  return menus.map((menu) => {
    const items = available(menu.items);
    if (items.at(-1) === "separator") items.pop();
    return { ...menu, items };
  });
}

export function defaultMenus({ recent, undoLabel, redoLabel }: MenuState): MenuDefinition[] {
  return [
    {
      title: "File",
      items: [
        { command: "file.new" },
        { command: "file.open" },
        {
          label: "Open recent",
          requires: "file.open",
          items: recent.map((f) => ({
            command: "file.open",
            params: { path: f.path },
            label: f.name,
          })),
        },
        "separator",
        { command: "file.save" },
        { command: "file.saveAs" },
        "separator",
        { command: "file.importImage" },
        { command: "file.exportPng" },
        "separator",
        { command: "app.quit" },
      ],
    },
    {
      title: "Edit",
      items: [
        { command: "history.undo", label: undoLabel ? `Undo ${undoLabel}` : "Undo" },
        { command: "history.redo", label: redoLabel ? `Redo ${redoLabel}` : "Redo" },
        "separator",
        { command: "edit.cut" },
        { command: "edit.copy" },
        { command: "edit.paste" },
        { command: "edit.pasteAsLayer" },
        { command: "edit.clear" },
        "separator",
        { command: "edit.transform" },
        { command: "edit.flipHorizontal" },
        { command: "edit.flipVertical" },
      ],
    },
    {
      title: "Select",
      items: [
        { command: "selection.selectAll" },
        { command: "selection.layerContent" },
        { command: "selection.deselect" },
        { command: "selection.invert" },
        "separator",
        { command: "selection.apply" },
      ],
    },
    {
      title: "Image",
      items: [
        { command: "image.canvasSize" },
        { command: "image.imageSize" },
        "separator",
        { command: "image.cropToSelection" },
        { command: "image.trim" },
        "separator",
        { command: "image.rotateLeft" },
        { command: "image.rotateRight" },
        { command: "image.rotate180" },
        { command: "image.flipHorizontal" },
        { command: "image.flipVertical" },
      ],
    },
    {
      title: "Layer",
      items: [
        { command: "layer.add" },
        { command: "layer.duplicate" },
        { command: "layer.remove" },
        "separator",
        { command: "layer.moveUp" },
        { command: "layer.moveDown" },
        "separator",
        { command: "layer.mergeDown" },
        { command: "layer.flatten" },
        "separator",
        { command: "layer.clear" },
        { command: "layer.flipHorizontal" },
        { command: "layer.flipVertical" },
      ],
    },
    {
      title: "View",
      items: [
        { command: "view.zoomIn" },
        { command: "view.zoomOut" },
        { command: "view.actualSize" },
        { command: "view.fit" },
        "separator",
        { command: "view.rotateLeft" },
        { command: "view.rotateRight" },
        { command: "view.resetRotation" },
        "separator",
        { command: "view.togglePanels" },
      ],
    },
  ];
}
