import { describe, expect, it, vi } from "vitest";
import { Drawing } from "$lib/core/drawing";
import { Editor } from "$lib/core/editor";
import { PaletteLibrary } from "$lib/core/palette";
import { registerAppCommands, type AppHost, type ViewControls } from "./app-commands";
import { DEFAULT_KEYMAP } from "./default-keymap";
import { defaultToolOptions } from "./tools";

function setup(withView = true) {
  const editor = new Editor(new Drawing(100, 100));
  const view: ViewControls = {
    fitView: vi.fn(),
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
    rotateBy: vi.fn(),
    resetRotation: vi.fn(),
  };
  const host: AppHost = {
    tool: "brush",
    options: defaultToolOptions(),
    view: withView ? view : null,
    palettes: new PaletteLibrary([{ name: "A", colors: [] }]),
    importImage: vi.fn(),
    newDocument: vi.fn(),
    openDocument: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn(),
    exportPng: vi.fn(),
    importPalette: vi.fn(),
    openCommandPalette: vi.fn(),
  };
  const unregister = registerAppCommands(editor.commands, host);
  return { editor, host, view, unregister };
}

describe("app commands", () => {
  it("selects tools", () => {
    const { editor, host } = setup();
    editor.commands.execute("tool.pixel");
    expect(host.tool).toBe("pixel");
    editor.commands.execute("tool.picker");
    expect(host.tool).toBe("picker");
  });

  it("resizes the current tool, and not the others", () => {
    const { editor, host } = setup();
    const { brush, eraser } = defaultToolOptions();
    editor.commands.execute("brush.grow");
    expect(host.options.brush.size).toBeGreaterThan(brush.size);
    expect(host.options.eraser.size).toBe(eraser.size);
    host.tool = "pixel";
    editor.commands.execute("brush.grow");
    expect(host.options.pixel.size).toBe(2);
    editor.commands.execute("brush.shrink");
    editor.commands.execute("brush.shrink");
    expect(host.options.pixel.size).toBe(1);
    host.tool = "picker";
    expect(editor.commands.isEnabled("brush.grow")).toBe(false);
  });

  it("selects brushes, switching between the brush and eraser tools", () => {
    const { editor, host } = setup();
    host.tool = "pixel";
    editor.commands.execute("brush.select", { id: "deevad/2B_pencil" });
    expect(host.tool).toBe("brush");
    expect(host.options.brush.preset).toBe("deevad/2B_pencil");
    editor.commands.execute("brush.select", { id: "deevad/kneaded_eraser" });
    expect(host.tool).toBe("eraser");
    expect(host.options.eraser.preset).toBe("deevad/kneaded_eraser");
    expect(host.options.brush.preset).toBe("deevad/2B_pencil");
    expect(editor.commands.isEnabled("brush.select", { id: "nope/nope" })).toBe(false);
  });

  it("sets the color, and edits palettes", () => {
    const { editor, host } = setup();
    const palettes = host.palettes!;
    expect(editor.commands.isEnabled("color.set", { color: "nope" })).toBe(false);
    editor.commands.execute("color.set", { color: "#ff8000" });
    expect(host.options.color).toEqual([255, 128, 0]);
    editor.commands.execute("palette.addColor");
    expect(palettes.active?.colors).toEqual([[255, 128, 0]]);
    expect(editor.commands.isEnabled("palette.removeColor", { index: 1 })).toBe(false);
    editor.commands.execute("palette.removeColor", { index: 0 });
    expect(palettes.active?.colors).toEqual([]);
    editor.commands.execute("palette.new");
    editor.commands.execute("palette.rename", { name: "Mine" });
    expect(palettes.palettes.map((p) => p.name)).toEqual(["A", "Mine"]);
    editor.commands.execute("palette.select", { index: 0 });
    editor.commands.execute("palette.delete");
    expect(palettes.palettes.map((p) => p.name)).toEqual(["Mine"]);
    editor.commands.execute("palette.delete");
    expect(editor.commands.isEnabled("palette.delete")).toBe(false);
    expect(editor.commands.isEnabled("palette.addColor")).toBe(false);
  });

  it("controls the view, once there is one", () => {
    const { editor, view } = setup();
    editor.commands.execute("view.zoomIn");
    editor.commands.execute("view.actualSize");
    expect(view.zoomBy).toHaveBeenCalledWith(1.25);
    expect(view.zoomTo).toHaveBeenCalledWith(1);
    expect(setup(false).editor.commands.isEnabled("view.fit")).toBe(false);
  });

  it("unregisters its commands", () => {
    const { editor, unregister } = setup();
    unregister();
    expect(editor.commands.has("tool.brush")).toBe(false);
    expect(editor.commands.has("layer.add")).toBe(true);
  });

  it("covers every command of the default keymap", () => {
    const { editor } = setup();
    for (const binding of DEFAULT_KEYMAP.bindings) {
      expect(editor.commands.has(binding.command), binding.command).toBe(true);
    }
  });
});
