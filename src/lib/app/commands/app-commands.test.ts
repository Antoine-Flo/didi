import { describe, expect, it, vi } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { PaletteLibrary } from "#lib/core/color/palette.js";
import { registerAppCommands, type AppHost, type ViewControls } from "./app-commands";
import { DEFAULT_KEYMAP } from "./default-keymap";
import { createModeRegistry } from "#lib/app/modes/builtin.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";

const tools = createToolRegistry();

function setup(withView = true) {
  const editor = new Editor(new Drawing(100, 100));
  const view: ViewControls = {
    fitView: vi.fn(),
    zoomStep: vi.fn(),
    zoomTo: vi.fn(),
    rotateBy: vi.fn(),
    resetRotation: vi.fn(),
    mirrorView: vi.fn(),
  };
  const host: AppHost = {
    mode: "painting",
    modes: createModeRegistry(),
    tool: "brush",
    tools,
    options: tools.defaultOptions(),
    view: withView ? view : null,
    hand: "right",
    togglePanels: vi.fn(),
    togglePixelGrid: vi.fn(),
    toggleInterface: vi.fn(),
    toggleFullScreen: vi.fn(),
    openShortcuts: vi.fn(),
    openAbout: vi.fn(),
    openPreferences: vi.fn(),
    palettes: new PaletteLibrary([{ name: "A", colors: [] }], null, []),
    notify: vi.fn(),
    openSizeDialog: vi.fn(),
    importImage: vi.fn(),
    newDocument: vi.fn(),
    openDocument: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn(),
    exportPng: vi.fn(),
    importPalette: vi.fn(),
    confirm: vi.fn(async () => true),
    openCommandPalette: vi.fn(),
    canUseFiles: true,
    quit: vi.fn(),
  };
  const unregister = registerAppCommands(editor.commands, host);
  return { editor, host, view, unregister };
}

describe("app commands", () => {
  it("switches modes", () => {
    const { editor, host } = setup();
    editor.commands.execute("mode.pixel");
    expect(host.mode).toBe("pixel");
    editor.commands.execute("mode.painting");
    expect(host.mode).toBe("painting");
  });

  it("chooses the shape of a selection with the tool of the mode", () => {
    const { editor, host } = setup();
    editor.commands.execute("selection.lasso");
    expect(host.tool).toBe("smoothSelect");
    expect(host.options.tools.smoothSelect.shape).toBe("lasso");
    host.mode = "pixel";
    editor.commands.execute("selection.rectangle");
    expect(host.tool).toBe("select");
    expect(host.options.tools.select.shape).toBe("rectangle");
  });

  it("selects tools", () => {
    const { editor, host } = setup();
    editor.commands.execute("tool.pixel");
    expect(host.tool).toBe("pixel");
    editor.commands.execute("tool.picker");
    expect(host.tool).toBe("picker");
  });

  it("resizes the current tool, and not the others", () => {
    const { editor, host } = setup();
    const { brush, eraser } = tools.defaultOptions().tools;
    editor.commands.execute("brush.grow");
    expect(host.options.tools.brush.size).toBeGreaterThan(brush.size as number);
    expect(host.options.tools.eraser.size).toBe(eraser.size);
    host.tool = "pixel";
    editor.commands.execute("brush.grow");
    expect(host.options.tools.pixel.size).toBe(2);
    editor.commands.execute("brush.shrink");
    editor.commands.execute("brush.shrink");
    expect(host.options.tools.pixel.size).toBe(1);
    host.tool = "picker";
    expect(editor.commands.isEnabled("brush.grow")).toBe(false);
  });

  it("selects brushes with the tool of their set, which remembers them", () => {
    const { editor, host } = setup();
    host.tool = "pixel";
    editor.commands.execute("brush.select", { id: "classic/charcoal" });
    expect(host.tool).toBe("texture");
    expect(host.options.tools.texture.preset).toBe("classic/charcoal");
    editor.commands.execute("brush.select", { id: "deevad/kneaded_eraser" });
    expect(host.tool).toBe("eraser");
    expect(host.options.tools.eraser.preset).toBe("deevad/kneaded_eraser");
    expect(host.options.tools.texture.preset).toBe("classic/charcoal");
    expect(host.options.tools.pencil.preset).toBe("deevad/2B_pencil");
    expect(editor.commands.isEnabled("brush.select", { id: "nope/nope" })).toBe(false);
  });

  it("switches the layout for left-handed users and back", () => {
    const { editor, host } = setup();
    editor.commands.execute("view.leftHanded");
    expect(host.hand).toBe("left");
    editor.commands.execute("view.rightHanded");
    expect(host.hand).toBe("right");
  });

  it("shows or hides the panels", () => {
    const { editor, host } = setup();
    editor.commands.execute("view.togglePanels");
    expect(host.togglePanels).toHaveBeenCalledOnce();
  });

  it("sets the color, and edits palettes", async () => {
    const { editor, host } = setup();
    const palettes = host.palettes!;
    expect(editor.commands.isEnabled("color.set", { color: "nope" })).toBe(false);
    editor.commands.execute("color.set", { color: "#ff8000" });
    expect(host.options.color).toEqual([255, 128, 0]);
    expect(palettes.locked).toBe(true);
    expect(editor.commands.isEnabled("palette.addColor")).toBe(false);
    expect(editor.commands.isEnabled("palette.delete")).toBe(false);
    editor.commands.execute("palette.toggleLock");
    expect(palettes.locked).toBe(false);
    editor.commands.execute("palette.addColor");
    expect(palettes.active?.colors).toEqual([[255, 128, 0]]);
    expect(editor.commands.isEnabled("palette.removeColor", { index: 1 })).toBe(false);
    editor.commands.execute("palette.removeColor", { index: 0 });
    expect(palettes.active?.colors).toEqual([]);
    editor.commands.execute("history.undo");
    expect(palettes.active?.colors).toEqual([[255, 128, 0]]);
    editor.commands.execute("palette.removeColor", { index: 0 });
    editor.commands.execute("palette.new");
    editor.commands.execute("palette.rename", { name: "Mine" });
    expect(palettes.palettes.map((p) => p.name)).toEqual(["A", "Mine"]);
    editor.commands.execute("palette.select", { index: 0 });
    // Deleting asks first.
    vi.mocked(host.confirm).mockResolvedValueOnce(false);
    editor.commands.execute("palette.delete");
    await vi.waitFor(() => expect(host.confirm).toHaveBeenCalledTimes(1));
    expect(palettes.palettes.map((p) => p.name)).toEqual(["A", "Mine"]);
    editor.commands.execute("palette.delete");
    await vi.waitFor(() => expect(palettes.palettes.map((p) => p.name)).toEqual(["Mine"]));
    editor.commands.execute("palette.delete");
    await vi.waitFor(() => expect(palettes.palettes).toEqual([]));
    expect(editor.commands.isEnabled("palette.delete")).toBe(false);
    expect(editor.commands.isEnabled("palette.addColor")).toBe(false);
  });

  it("copies a palette, unlocked to be edited", () => {
    const { editor, host } = setup();
    const palettes = host.palettes!;
    expect(editor.commands.isEnabled("palette.duplicate", { name: " " })).toBe(false);
    editor.commands.execute("palette.duplicate", { name: " Copy " });
    expect(palettes.active?.name).toBe("Copy");
    expect(palettes.locked).toBe(false);
  });

  it("controls the view, once there is one", () => {
    const { editor, view } = setup();
    editor.commands.execute("view.zoomIn");
    editor.commands.execute("view.actualSize");
    expect(view.zoomStep).toHaveBeenCalledWith(1);
    expect(view.zoomTo).toHaveBeenCalledWith(1);
    expect(setup(false).editor.commands.isEnabled("view.fit")).toBe(false);
  });

  it("unregisters its commands", () => {
    const { editor, unregister } = setup();
    unregister();
    expect(editor.commands.has("tool.brush")).toBe(false);
    expect(editor.commands.has("layer.add")).toBe(true);
  });

  it("covers every command of the default keymap and of the modes' shortcuts", () => {
    const { editor, host } = setup();
    const bindings = [
      ...DEFAULT_KEYMAP.bindings,
      ...host.modes.list().flatMap((mode) => mode.bindings),
    ];
    for (const binding of bindings) {
      expect(editor.commands.has(binding.command), binding.command).toBe(true);
    }
  });
});
