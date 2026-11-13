import { describe, expect, it } from "vitest";
import { Painter } from "#lib/app/input/painter.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { fill, commandsOf } from "#lib/core/testing/test-utils.js";
import { runCommand } from "#lib/app/commands/run-command.js";

/** Two layers, with floating content moved on the top one. */
function floatingContent() {
  const tools = createToolRegistry();
  const editor = new Editor(new Drawing(64, 64));
  commandsOf(editor).execute("layer.add");
  commandsOf(editor).execute("layer.add");
  const square = { x: 10, y: 10, width: 10, height: 10 };
  editor.drawing.writePixels(editor.activeLayer!.id, square, fill(square, [255, 0, 0, 255]));
  const painter = new Painter(editor, {
    tool: () => tools.get("select"),
    options: () => tools.defaultOptions(),
    onPick: () => {},
    onMessage: () => {},
  });
  const drag = (x0: number, y0: number, x1: number, y1: number) => {
    painter.begin({ x: x0, y: y0, viewZoom: 8 });
    painter.move([{ x: x1, y: y1, viewZoom: 8 }]);
    painter.end();
  };
  drag(10.5, 10.5, 19.5, 19.5);
  drag(13, 13, 23, 16);
  expect(editor.selection.floating).not.toBeNull();
  return { editor, painter, drag };
}

describe("runCommand", () => {
  it("does nothing while the pen is down", () => {
    const { editor } = floatingContent();
    const layers = editor.drawing.layers.length;
    expect(runCommand(commandsOf(editor), editor, { active: true }, "layer.add")).toBe(false);
    expect(editor.drawing.layers).toHaveLength(layers);
    expect(editor.selection.floating).not.toBeNull();
  });

  it("lays floating content down before a layer is deleted, so that the tool still works", () => {
    const { editor, painter, drag } = floatingContent();
    expect(runCommand(commandsOf(editor), editor, painter, "layer.remove")).toBe(true);
    expect(editor.selection.floating).toBeNull();
    expect(() => drag(22, 15, 25, 18)).not.toThrow();
  });

  it("keeps floating content for commands that do not concern layers", () => {
    const { editor, painter } = floatingContent();
    expect(runCommand(commandsOf(editor), editor, painter, "history.undo")).toBe(true);
    expect(editor.selection.floating).toBeNull();
    expect(runCommand(commandsOf(editor), editor, painter, "history.redo")).toBe(true);
    expect(editor.selection.floating).not.toBeNull();
  });

  it("leaves floating content alone when the command is disabled", () => {
    const { editor, painter } = floatingContent();
    expect(runCommand(commandsOf(editor), editor, painter, "layer.moveUp")).toBe(false);
    expect(editor.selection.floating).not.toBeNull();
  });
});
