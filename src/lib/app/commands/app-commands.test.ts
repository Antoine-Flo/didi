import { describe, expect, it, vi } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { PaletteLibrary } from "#lib/core/color/palette.js";
import { registerAppCommands, type AppHost } from "#lib/app/commands/app-commands.js";
import type { ViewControls } from "#lib/app/commands/view-commands.js";
import { DEFAULT_KEYMAP } from "#lib/app/commands/default-keymap.js";
import { createModeRegistry } from "#lib/app/modes/builtin.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

const tools = createToolRegistry();

function setup() {
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
    view,
    hand: "right",
    togglePanels: vi.fn(),
    togglePixelGrid: vi.fn(),
    toggleTileGrid: vi.fn(),
    togglePreview: vi.fn(),
    shown: vi.fn(() => true),
    toggleInterface: vi.fn(),
    toggleFullScreen: vi.fn(),
    palettes: new PaletteLibrary([{ name: "A", colors: [] }], null, []),
    recentColors: vi.fn(() => []),
    clearRecentColors: vi.fn(),
    notify: vi.fn(),
    importImage: vi.fn(),
    openDocument: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn(),
    exportPng: vi.fn(),
    importPalette: vi.fn(),
    confirm: vi.fn(async () => true),
    openDialog: vi.fn(),
    canUseFiles: true,
    quit: vi.fn(),
    version: "1.0.0",
    system: () => ({ source: "linux", browser: "", os: "linux" }),
    editorFacts: () => ({
      input: "pen",
      mode: "painting",
      tool: "brush",
      doc: "100x100, 1 layers",
      screen: "800x600@1",
      layout: "normal",
      error: "",
    }),
    openLink: vi.fn(async () => {}),
  };
  registerAppCommands(commandsOf(editor), host);
  return { editor, host, view };
}

describe("app commands", () => {
  it("switches modes", () => {
    const { editor, host } = setup();
    commandsOf(editor).execute("mode.pixel");
    expect(host.mode).toBe("pixel");
    commandsOf(editor).execute("mode.painting");
    expect(host.mode).toBe("painting");
  });

  it("chooses the shape of a selection with the tool of the mode", () => {
    const { editor, host } = setup();
    commandsOf(editor).execute("selection.lasso");
    expect(host.tool).toBe("smoothSelect");
    expect(host.options.tools.smoothSelect.shape).toBe("lasso");
    host.mode = "pixel";
    commandsOf(editor).execute("selection.rectangle");
    expect(host.tool).toBe("select");
    expect(host.options.tools.select.shape).toBe("rectangle");
  });

  it("selects tools", () => {
    const { editor, host } = setup();
    commandsOf(editor).execute("tool.pixel");
    expect(host.tool).toBe("pixel");
    commandsOf(editor).execute("tool.picker");
    expect(host.tool).toBe("picker");
  });

  it("resizes the current tool, and not the others", () => {
    const { editor, host } = setup();
    const { brush, eraser } = tools.defaultOptions().tools;
    commandsOf(editor).execute("brush.grow");
    expect(host.options.tools.brush.size).toBeGreaterThan(brush.size as number);
    expect(host.options.tools.eraser.size).toBe(eraser.size);
    host.tool = "pixel";
    commandsOf(editor).execute("brush.grow");
    expect(host.options.tools.pixel.size).toBe(2);
    commandsOf(editor).execute("brush.shrink");
    commandsOf(editor).execute("brush.shrink");
    expect(host.options.tools.pixel.size).toBe(1);
    host.tool = "picker";
    expect(commandsOf(editor).isEnabled("brush.grow")).toBe(false);
  });

  it("selects brushes with the tool of their set, which remembers them", () => {
    const { editor, host } = setup();
    host.tool = "pixel";
    commandsOf(editor).execute("brush.select", { id: "classic/charcoal" });
    expect(host.tool).toBe("texture");
    expect(host.options.tools.texture.preset).toBe("classic/charcoal");
    commandsOf(editor).execute("brush.select", { id: "deevad/kneaded_eraser" });
    expect(host.tool).toBe("eraser");
    expect(host.options.tools.eraser.preset).toBe("deevad/kneaded_eraser");
    expect(host.options.tools.texture.preset).toBe("classic/charcoal");
    expect(host.options.tools.pencil.preset).toBe("deevad/2B_pencil");
    expect(commandsOf(editor).isEnabled("brush.select", { id: "nope/nope" })).toBe(false);
  });

  it("switches the layout for left-handed users and back", () => {
    const { editor, host } = setup();
    commandsOf(editor).execute("view.leftHanded");
    expect(host.hand).toBe("left");
    commandsOf(editor).execute("view.rightHanded");
    expect(host.hand).toBe("right");
  });

  it("shows or hides the panels", () => {
    const { editor, host } = setup();
    commandsOf(editor).execute("view.togglePanels");
    expect(host.togglePanels).toHaveBeenCalledOnce();
  });

  it("swaps the two colors, even without one", () => {
    const { editor, host } = setup();
    host.options.color = [1, 2, 3];
    host.options.secondary = [4, 5, 6];
    commandsOf(editor).execute("color.swap");
    expect(host.options.color).toEqual([4, 5, 6]);
    expect(host.options.secondary).toEqual([1, 2, 3]);
    host.options.secondary = null;
    commandsOf(editor).execute("color.swap");
    expect(host.options.color).toBeNull();
    expect(host.options.secondary).toEqual([4, 5, 6]);
  });

  it("clears the recent colors only when there are some", () => {
    const { editor, host } = setup();
    expect(commandsOf(editor).isEnabled("color.clearRecent")).toBe(false);
    vi.mocked(host.recentColors).mockReturnValue([[1, 2, 3]]);
    commandsOf(editor).execute("color.clearRecent");
    expect(host.clearRecentColors).toHaveBeenCalledOnce();
  });

  it("adds the current color even if already there, and uses a palette color by its place", () => {
    const { editor, host } = setup();
    const palettes = host.palettes!;
    commandsOf(editor).execute("palette.toggleLock");
    commandsOf(editor).execute("color.set", { color: "#ff8000" });
    commandsOf(editor).execute("palette.addColor");
    commandsOf(editor).execute("color.set", { color: "#0000ff" });
    commandsOf(editor).execute("palette.addColor");
    expect(commandsOf(editor).isEnabled("palette.addColor")).toBe(true);
    commandsOf(editor).execute("palette.addColor");
    expect(palettes.active?.colors).toEqual([
      [255, 128, 0],
      [0, 0, 255],
      [0, 0, 255],
    ]);
    expect(commandsOf(editor).isEnabled("palette.pickColor", { index: 3 })).toBe(false);
    // The color added is selected.
    expect(palettes.picked).toBe(2);
    commandsOf(editor).execute("palette.pickColor", { index: 0 });
    expect(palettes.picked).toBe(0);
    expect(host.options.color).toEqual([255, 128, 0]);
    commandsOf(editor).execute("palette.pickColor", { index: 1 });
    expect(host.options.color).toEqual([0, 0, 255]);
    commandsOf(editor).execute("palette.addColor");
    expect(palettes.picked).toBe(3);
    // Taken from a locked palette too, without editing it.
    commandsOf(editor).execute("palette.toggleLock");
    commandsOf(editor).execute("palette.pickColor", { index: 0 });
    expect(host.options.color).toEqual([255, 128, 0]);
    expect(palettes.picked).toBe(0);
  });

  it("sets the color, and edits palettes", async () => {
    const { editor, host } = setup();
    const palettes = host.palettes!;
    expect(commandsOf(editor).isEnabled("color.set", { color: "nope" })).toBe(false);
    commandsOf(editor).execute("color.set", { color: "#ff8000" });
    expect(host.options.color).toEqual([255, 128, 0]);
    expect(palettes.locked).toBe(true);
    expect(commandsOf(editor).isEnabled("palette.addColor")).toBe(false);
    expect(commandsOf(editor).isEnabled("palette.delete")).toBe(false);
    commandsOf(editor).execute("palette.toggleLock");
    expect(palettes.locked).toBe(false);
    commandsOf(editor).execute("palette.addColor");
    expect(palettes.active?.colors).toEqual([[255, 128, 0]]);
    expect(commandsOf(editor).isEnabled("palette.removeColor", { index: 1 })).toBe(false);
    commandsOf(editor).execute("palette.removeColor", { index: 0 });
    expect(palettes.active?.colors).toEqual([]);
    commandsOf(editor).execute("history.undo");
    expect(palettes.active?.colors).toEqual([[255, 128, 0]]);
    commandsOf(editor).execute("palette.removeColor", { index: 0 });
    commandsOf(editor).execute("palette.new");
    commandsOf(editor).execute("palette.rename", { name: "Mine" });
    expect(palettes.palettes.map((p) => p.name)).toEqual(["A", "Mine"]);
    commandsOf(editor).execute("palette.select", { index: 0 });
    // Deleting asks first.
    vi.mocked(host.confirm).mockResolvedValueOnce(false);
    commandsOf(editor).execute("palette.delete");
    await vi.waitFor(() => expect(host.confirm).toHaveBeenCalledTimes(1));
    expect(palettes.palettes.map((p) => p.name)).toEqual(["A", "Mine"]);
    commandsOf(editor).execute("palette.delete");
    await vi.waitFor(() => expect(palettes.palettes.map((p) => p.name)).toEqual(["Mine"]));
    commandsOf(editor).execute("palette.delete");
    await vi.waitFor(() => expect(palettes.palettes).toEqual([]));
    expect(commandsOf(editor).isEnabled("palette.delete")).toBe(false);
    expect(commandsOf(editor).isEnabled("palette.addColor")).toBe(false);
  });

  it("copies a palette, unlocked to be edited", () => {
    const { editor, host } = setup();
    const palettes = host.palettes!;
    expect(commandsOf(editor).isEnabled("palette.duplicate", { name: " " })).toBe(false);
    commandsOf(editor).execute("palette.duplicate", { name: " Copy " });
    expect(palettes.active?.name).toBe("Copy");
    expect(palettes.locked).toBe(false);
  });

  it("tells which switches are on, for View → Show", () => {
    const { editor, host } = setup();
    vi.mocked(host.shown).mockImplementation((what) => what === "tileGrid");
    expect(commandsOf(editor).isChecked("view.tileGrid")).toBe(true);
    expect(commandsOf(editor).isChecked("view.pixelGrid")).toBe(false);
    expect(commandsOf(editor).isChecked("view.zoomIn")).toBeUndefined();
  });

  it("controls the view", () => {
    const { editor, view } = setup();
    commandsOf(editor).execute("view.zoomIn");
    commandsOf(editor).execute("view.actualSize");
    expect(view.zoomStep).toHaveBeenCalledWith(1);
    expect(view.zoomTo).toHaveBeenCalledWith(1);
    commandsOf(editor).execute("view.fit");
    commandsOf(editor).execute("view.zoomOut");
    commandsOf(editor).execute("view.rotateLeft");
    commandsOf(editor).execute("view.resetRotation");
    commandsOf(editor).execute("view.mirror");
    expect(view.fitView).toHaveBeenCalledOnce();
    expect(view.zoomStep).toHaveBeenCalledWith(-1);
    expect(view.rotateBy).toHaveBeenCalledWith(-Math.PI / 12);
    expect(view.resetRotation).toHaveBeenCalledOnce();
    expect(view.mirrorView).toHaveBeenCalledOnce();
  });

  it("opens each dialog", () => {
    const { editor, host } = setup();
    const dialogs = {
      "file.new": "start",
      "app.commandPalette": "commandPalette",
      "app.shortcuts": "shortcuts",
      "app.preferences": "preferences",
      "app.about": "about",
      "view.gridSettings": "grid",
      "image.canvasSize": "canvasSize",
      "image.imageSize": "imageSize",
    };
    for (const [command, dialog] of Object.entries(dialogs)) {
      vi.mocked(host.openDialog).mockClear();
      commandsOf(editor).execute(command);
      expect(host.openDialog, command).toHaveBeenCalledExactlyOnceWith(dialog);
    }
  });

  it("opens the docs, the bug and feedback forms and the Discord, with what they are told", () => {
    const { editor, host } = setup();
    const opened = (command: string) => {
      vi.mocked(host.openLink).mockClear();
      commandsOf(editor).execute(command);
      return new URL(vi.mocked(host.openLink).mock.calls[0][0]);
    };
    const bug = opened("app.reportBug");
    expect(bug.href).toContain("tally.so/r/rDa0PX");
    expect(bug.searchParams.get("tool")).toBe("brush");
    expect(bug.searchParams.get("source")).toBe("linux");
    const feedback = opened("app.feedback");
    expect(feedback.href).toContain("tally.so/r/dba2rq");
    expect(feedback.searchParams.get("version")).toBe("1.0.0");
    expect(feedback.searchParams.has("tool")).toBe(false);
    expect(opened("app.discord").host).toBe("discord.gg");
    expect(opened("app.documentation").href).toBe("https://didipaint.com/doc/");
  });

  it("tells when a link cannot open", async () => {
    const { editor, host } = setup();
    vi.mocked(host.openLink).mockRejectedValueOnce(new Error("no browser"));
    commandsOf(editor).execute("app.discord");
    await vi.waitFor(() => expect(host.notify).toHaveBeenCalledOnce());
  });

  it("covers every command of the default keymap and of the modes' shortcuts", () => {
    const { editor, host } = setup();
    const bindings = [
      ...DEFAULT_KEYMAP.bindings,
      ...host.modes.list().flatMap((mode) => mode.bindings),
    ];
    for (const binding of bindings) {
      expect(commandsOf(editor).has(binding.command), binding.command).toBe(true);
    }
  });
});
