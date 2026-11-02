import { describe, expect, it } from "vitest";
import { createModeRegistry } from "#lib/app/modes/builtin.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { newEditor } from "#lib/app/files/new-drawing.js";
import { registerAppCommands, type AppHost } from "./app-commands";
import { defaultMenus, type MenuEntry } from "./default-menus";

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
    } as unknown as AppHost);
    const menus = defaultMenus({
      recent: [{ path: "/a.didi", name: "a" }],
      undoLabel: null,
      redoLabel: null,
    });
    for (const id of menus.flatMap((m) => commandsOf(m.items))) {
      expect(editor.commands.has(id), id).toBe(true);
    }
  });

  it("name the undo and redo steps, and list recent files", () => {
    const [file, edit] = defaultMenus({
      recent: [{ path: "/a.didi", name: "a" }],
      undoLabel: "Brush",
      redoLabel: null,
    });
    expect(edit.items[0]).toMatchObject({ command: "history.undo", label: "Undo Brush" });
    expect(edit.items[1]).toMatchObject({ command: "history.redo", label: "Redo" });
    const recent = file.items.find((e) => e !== "separator" && "items" in e);
    expect(recent).toMatchObject({
      items: [{ command: "file.open", params: { path: "/a.didi" }, label: "a" }],
    });
  });
});
