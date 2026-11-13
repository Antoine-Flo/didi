import { describe, expect, it } from "vitest";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { newEditor } from "#lib/app/files/new-drawing.js";
import { registerAppCommands, type AppHost } from "#lib/app/commands/app-commands.js";
import { availableMenus, defaultMenus, type MenuEntry } from "#lib/app/commands/default-menus.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

const menuCommands = (items: MenuEntry[]): string[] =>
  items.flatMap((e) =>
    e === "separator" ? [] : "items" in e ? menuCommands(e.items) : [e.command],
  );

describe("default menus", () => {
  it("only run existing commands", () => {
    const editor = newEditor(8, 8, "transparent");
    const tools = createToolRegistry();
    registerAppCommands(commandsOf(editor), {
      tools,
      options: tools.defaultOptions(),
      canUseFiles: true,
      quit: () => {},
    } as unknown as AppHost);
    const menus = defaultMenus({
      recent: [{ path: "/a.didi", name: "a" }],
      undoLabel: null,
      redoLabel: null,
    });
    for (const id of menus.flatMap((m) => menuCommands(m.items))) {
      expect(commandsOf(editor).has(id), id).toBe(true);
    }
  });

  it("leave out what does not exist in a browser, with its separators", () => {
    const editor = newEditor(8, 8, "transparent");
    const tools = createToolRegistry();
    registerAppCommands(commandsOf(editor), {
      tools,
      options: tools.defaultOptions(),
      canUseFiles: false,
      quit: null,
    } as unknown as AppHost);
    const menus = defaultMenus({ recent: [], undoLabel: null, redoLabel: null });
    const [file] = availableMenus(menus, (id) => commandsOf(editor).has(id));
    expect(file.items).toEqual([
      { command: "file.new" },
      "separator",
      { command: "file.importImage" },
      { command: "file.exportPng" },
    ]);
  });

  it("name the undo and redo steps, and list recent files", () => {
    const [file, edit] = defaultMenus({
      recent: [
        { path: "/a.didi", name: "a" },
        { path: "/b.didi", name: "b" },
      ],
      undoLabel: "Brush",
      redoLabel: null,
    });
    expect(edit.items[0]).toMatchObject({ command: "history.undo", label: "Undo Brush" });
    expect(edit.items[1]).toMatchObject({ command: "history.redo", label: "Redo" });
    const recent = file.items.find((e) => e !== "separator" && "items" in e);
    expect(recent).toMatchObject({
      items: [
        { command: "file.open", params: { path: "/a.didi" }, label: "a" },
        { command: "file.open", params: { path: "/b.didi" }, label: "b" },
      ],
    });
  });
});
