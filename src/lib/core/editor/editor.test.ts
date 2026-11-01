import { describe, expect, it } from "vitest";
import { Drawing } from "../document/drawing";
import { Editor } from "./editor";

function setup(names: string[] = []) {
  const editor = new Editor(new Drawing(100, 100));
  for (const name of names) editor.commands.execute("layer.add", { props: { name } });
  return editor;
}

const names = (editor: Editor) => editor.drawing.layers.map((l) => l.name);

describe("Editor", () => {
  it("starts on the top layer of an existing drawing", () => {
    const drawing = new Drawing(100, 100);
    for (const name of ["A", "B", "C"]) drawing.addLayer(drawing.createLayer({ name }));
    expect(new Editor(drawing).activeLayer?.name).toBe("C");
  });

  it("activates the first layer added to an empty drawing", () => {
    const editor = new Editor(new Drawing(100, 100));
    const layer = editor.drawing.createLayer({ name: "A" });
    // Through the history, without the command that selects the new layer.
    const errors: unknown[] = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (fn) => {
      try {
        fn();
      } catch (e) {
        errors.push(e);
      }
    };
    try {
      editor.history.push({
        label: "x",
        apply: (d) => d.addLayer(layer),
        revert: (d) => void d.removeLayer(layer.id),
      });
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(errors).toEqual([]);
    expect(editor.activeLayer?.name).toBe("A");
  });

  it("has no active layer without layers", () => {
    const editor = setup();
    expect(editor.activeLayer).toBeNull();
    expect(editor.commands.isEnabled("layer.remove")).toBe(false);
  });

  it("adds new layers above the active one, and selects them", () => {
    const editor = setup(["A", "B"]);
    expect(editor.activeLayer?.name).toBe("B");
    editor.setActiveLayer(editor.drawing.layers[0].id);
    editor.commands.execute("layer.add", { props: { name: "C" } });
    expect(names(editor)).toEqual(["A", "C", "B"]);
    expect(editor.activeLayer?.name).toBe("C");
  });

  it("targets the active layer when no id is given", () => {
    const editor = setup(["A", "B"]);
    editor.commands.execute("layer.update", { changes: { opacity: 0.3 } });
    expect(editor.drawing.layers.map((l) => l.opacity)).toEqual([1, 0.3]);
    editor.commands.execute("layer.move", { index: 0 });
    expect(names(editor)).toEqual(["B", "A"]);
  });

  it("selects the layer below after removing the active one", () => {
    const editor = setup(["A", "B", "C"]);
    editor.setActiveLayer(editor.drawing.layers[1].id);
    editor.commands.execute("layer.remove");
    expect(names(editor)).toEqual(["A", "C"]);
    expect(editor.activeLayer?.name).toBe("A");

    editor.commands.execute("layer.remove");
    expect(editor.activeLayer?.name).toBe("C");
    editor.commands.execute("layer.remove");
    expect(editor.activeLayer).toBeNull();
  });

  it("keeps the active layer when removing another one", () => {
    const editor = setup(["A", "B"]);
    editor.commands.execute("layer.remove", { id: editor.drawing.layers[0].id });
    expect(editor.activeLayer?.name).toBe("B");
  });

  it("keeps a valid active layer through undo and redo", () => {
    const editor = setup(["A", "B"]);
    editor.commands.execute("history.undo");
    expect(names(editor)).toEqual(["A"]);
    expect(editor.activeLayer?.name).toBe("A");
    editor.commands.execute("history.undo");
    expect(editor.activeLayer).toBeNull();
    editor.commands.execute("history.redo");
    expect(editor.activeLayer?.name).toBe("A");
  });

  it("enables undo and redo only when possible", () => {
    const editor = setup();
    expect(editor.commands.isEnabled("history.undo")).toBe(false);
    editor.commands.execute("layer.add");
    expect(editor.commands.isEnabled("history.undo")).toBe(true);
    expect(editor.commands.isEnabled("history.redo")).toBe(false);
    editor.commands.execute("history.undo");
    expect(editor.commands.isEnabled("history.redo")).toBe(true);
  });

  it("refuses to activate an unknown layer", () => {
    const editor = setup(["A"]);
    expect(() => editor.setActiveLayer("nope")).toThrow();
    expect(editor.activeLayer?.name).toBe("A");
  });

  it("disables moves to invalid positions", () => {
    const editor = setup(["A", "B"]);
    expect(editor.commands.isEnabled("layer.move", { index: 1 })).toBe(false);
    expect(editor.commands.isEnabled("layer.move", { index: 5 })).toBe(false);
    expect(editor.commands.isEnabled("layer.move", { index: 0 })).toBe(true);
  });

  it("moves the active layer up and down, within bounds", () => {
    const editor = setup(["A", "B", "C"]);
    editor.commands.execute("layer.select", { id: editor.drawing.layers[1].id });
    expect(editor.commands.execute("layer.moveUp")).toBe(true);
    expect(names(editor)).toEqual(["A", "C", "B"]);
    expect(editor.commands.isEnabled("layer.moveUp")).toBe(false);
    editor.commands.execute("layer.moveDown");
    editor.commands.execute("layer.moveDown");
    expect(names(editor)).toEqual(["B", "A", "C"]);
    expect(editor.commands.isEnabled("layer.moveDown")).toBe(false);
    expect(editor.activeLayer?.name).toBe("B");
  });

  it("selects layers by id, above and below", () => {
    const editor = setup(["A", "B", "C"]);
    expect(editor.commands.isEnabled("layer.selectAbove")).toBe(false);
    editor.commands.execute("layer.selectBelow");
    expect(editor.activeLayer?.name).toBe("B");
    editor.commands.execute("layer.select", { id: editor.drawing.layers[0].id });
    expect(editor.activeLayer?.name).toBe("A");
    expect(editor.commands.isEnabled("layer.selectBelow")).toBe(false);
    expect(editor.commands.isEnabled("layer.select", { id: "nope" })).toBe(false);
    expect(editor.commands.isEnabled("layer.moveUp")).toBe(true);
    expect(new Editor(new Drawing(10, 10)).commands.isEnabled("layer.selectAbove")).toBe(false);
  });

  it("can run every command that needs no params without params", () => {
    const editor = setup(["A", "B"]);
    for (const command of editor.commands.list().filter((c) => !c.needsParams)) {
      expect(() => editor.commands.isEnabled(command.id)).not.toThrow();
      expect(() => editor.commands.execute(command.id)).not.toThrow();
    }
  });
});
