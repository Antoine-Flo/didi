import { describe, expect, it } from "vitest";
import { createModeRegistry } from "#lib/app/modes/builtin.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { newEditor } from "#lib/app/files/new-drawing.js";
import { registerAppCommands, type AppHost } from "./app-commands";
import { availableMenus, defaultMenus, type MenuEntry } from "./default-menus";

const commandsOf = (items: MenuEntry[]): string[] =>
  items.flatMap((e) => (e === "separator" ? [] : "items" in e ? commandsOf(e.items) : [e.command]));

describe("default menus", () => {
  it("only run existing commands", () => {
    const editor = newEditor(8, 8, "transparent");
    const tools = createToolRegistry();
    registerAppCommands(editor.commands, {
      modes: createModeRegistry(),
      tools,
      options: tools.defaultOptions(),
      canUseFiles: true,
      quit: () => {},
    } as unknown as AppHost);
    const menus = defaultMenus({
      recent: [{ path: "/a.didi", name: "a" }],
      modes: createModeRegistry().list(),
      undoLabel: null,
      redoLabel: null,
    });
    for (const id of menus.flatMap((m) => commandsOf(m.items))) {
      expect(editor.commands.has(id), id).toBe(true);
    }
  });

  it("leave out what does not exist in a browser, with its separators", () => {
    const editor = newEditor(8, 8, "transparent");
    const tools = createToolRegistry();
    registerAppCommands(editor.commands, {
      modes: createModeRegistry(),
      tools,
      options: tools.defaultOptions(),
      canUseFiles: false,
      quit: null,
    } as unknown as AppHost);
    const menus = defaultMenus({ recent: [], modes: [], undoLabel: null, redoLabel: null });
    const [file] = availableMenus(menus, (id) => editor.commands.has(id));
    expect(file.items).toEqual([
      { command: "file.new" },
      "separator",
      { command: "file.importImage" },
      { command: "file.exportPng" },
    ]);
  });

  it("name the undo and redo steps, and list recent files with their mode's icon", () => {
    const modes = createModeRegistry().list();
    const pixel = modes.find((mode) => mode.id === "pixel")!;
    const [file, edit] = defaultMenus({
      recent: [
        { path: "/a.didi", name: "a", mode: "pixel" },
        { path: "/b.didi", name: "b" },
      ],
      modes,
      undoLabel: "Brush",
      redoLabel: null,
    });
    expect(edit.items[0]).toMatchObject({ command: "history.undo", label: "Undo Brush" });
    expect(edit.items[1]).toMatchObject({ command: "history.redo", label: "Redo" });
    const recent = file.items.find((e) => e !== "separator" && "items" in e);
    expect(recent).toMatchObject({
      items: [
        { command: "file.open", params: { path: "/a.didi" }, label: "a", icon: pixel.icon },
        { command: "file.open", params: { path: "/b.didi" }, label: "b", icon: undefined },
      ],
    });
  });
});
