import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

function setup(names: string[] = []) {
  const editor = new Editor(new Drawing(100, 100));
  for (const name of names) {
    commandsOf(editor).execute("layer.add", { props: { name } });
  }
  return editor;
}

const names = (editor: Editor) => editor.drawing.layers.map((l) => l.name);

describe("Editor", () => {
  it("starts on the top layer of an existing drawing", () => {
    const drawing = new Drawing(100, 100);
    for (const name of ["A", "B", "C"]) {
      drawing.addLayer(drawing.createLayer({ name }));
    }
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
    expect(commandsOf(editor).isEnabled("layer.remove")).toBe(false);
  });

  it("adds new layers above the active one, and selects them", () => {
    const editor = setup(["A", "B"]);
    expect(editor.activeLayer?.name).toBe("B");
    editor.setActiveLayer(editor.drawing.layers[0].id);
    commandsOf(editor).execute("layer.add", { props: { name: "C" } });
    expect(names(editor)).toEqual(["A", "C", "B"]);
    expect(editor.activeLayer?.name).toBe("C");
  });

  it("targets the active layer when no id is given", () => {
    const editor = setup(["A", "B"]);
    commandsOf(editor).execute("layer.update", { changes: { opacity: 0.3 } });
    expect(editor.drawing.layers.map((l) => l.opacity)).toEqual([1, 0.3]);
    commandsOf(editor).execute("layer.move", { index: 0 });
    expect(names(editor)).toEqual(["B", "A"]);
  });

  it("does not undo showing or hiding a layer", () => {
    const editor = setup(["A"]);
    const { history } = editor;
    const layer = editor.drawing.layers[0];
    commandsOf(editor).execute("layer.update", { changes: { opacity: 0.5 } });
    history.undo();
    const { steps, marker } = history;

    commandsOf(editor).execute("layer.update", { changes: { visible: false } });
    expect(layer.visible).toBe(false);
    expect(history.steps).toBe(steps);
    expect(history.marker).toBe(marker);
    // The undone step can still be redone.
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(layer.opacity).toBe(0.5);
    history.undo();
    expect(layer.opacity).toBe(1);
    expect(layer.visible).toBe(false);
  });

  it("only undoes the other settings when changed along with the visibility", () => {
    const editor = setup(["A"]);
    const layer = editor.drawing.layers[0];
    commandsOf(editor).execute("layer.update", { changes: { visible: false, opacity: 0.5 } });
    expect(layer.visible).toBe(false);
    expect(layer.opacity).toBe(0.5);
    editor.history.undo();
    expect(layer.visible).toBe(false);
    expect(layer.opacity).toBe(1);
  });

  it("selects the layer below after removing the active one", () => {
    const editor = setup(["A", "B", "C"]);
    editor.setActiveLayer(editor.drawing.layers[1].id);
    commandsOf(editor).execute("layer.remove");
    expect(names(editor)).toEqual(["A", "C"]);
    expect(editor.activeLayer?.name).toBe("A");

    commandsOf(editor).execute("layer.remove");
    expect(editor.activeLayer?.name).toBe("C");
    commandsOf(editor).execute("layer.remove");
    expect(editor.activeLayer).toBeNull();
  });

  it("keeps the active layer when removing another one", () => {
    const editor = setup(["A", "B"]);
    commandsOf(editor).execute("layer.remove", { id: editor.drawing.layers[0].id });
    expect(editor.activeLayer?.name).toBe("B");
  });

  it("keeps a valid active layer through undo and redo", () => {
    const editor = setup(["A", "B"]);
    commandsOf(editor).execute("history.undo");
    expect(names(editor)).toEqual(["A"]);
    expect(editor.activeLayer?.name).toBe("A");
    commandsOf(editor).execute("history.undo");
    expect(editor.activeLayer).toBeNull();
    commandsOf(editor).execute("history.redo");
    expect(editor.activeLayer?.name).toBe("A");
  });

  it("enables undo and redo only when possible", () => {
    const editor = setup();
    expect(commandsOf(editor).isEnabled("history.undo")).toBe(false);
    commandsOf(editor).execute("layer.add");
    expect(commandsOf(editor).isEnabled("history.undo")).toBe(true);
    expect(commandsOf(editor).isEnabled("history.redo")).toBe(false);
    commandsOf(editor).execute("history.undo");
    expect(commandsOf(editor).isEnabled("history.redo")).toBe(true);
  });

  it("refuses to activate an unknown layer", () => {
    const editor = setup(["A"]);
    expect(() => editor.setActiveLayer("nope")).toThrow();
    expect(editor.activeLayer?.name).toBe("A");
  });

  it("disables moves to invalid positions", () => {
    const editor = setup(["A", "B"]);
    expect(commandsOf(editor).isEnabled("layer.move", { index: 1 })).toBe(false);
    expect(commandsOf(editor).isEnabled("layer.move", { index: 5 })).toBe(false);
    expect(commandsOf(editor).isEnabled("layer.move", { index: 0 })).toBe(true);
  });

  it("moves the active layer up and down, within bounds", () => {
    const editor = setup(["A", "B", "C"]);
    commandsOf(editor).execute("layer.select", { id: editor.drawing.layers[1].id });
    expect(commandsOf(editor).execute("layer.moveUp")).toBe(true);
    expect(names(editor)).toEqual(["A", "C", "B"]);
    expect(commandsOf(editor).isEnabled("layer.moveUp")).toBe(false);
    commandsOf(editor).execute("layer.moveDown");
    commandsOf(editor).execute("layer.moveDown");
    expect(names(editor)).toEqual(["B", "A", "C"]);
    expect(commandsOf(editor).isEnabled("layer.moveDown")).toBe(false);
    expect(editor.activeLayer?.name).toBe("B");
  });

  it("selects layers by id, above and below", () => {
    const editor = setup(["A", "B", "C"]);
    expect(commandsOf(editor).isEnabled("layer.selectAbove")).toBe(false);
    commandsOf(editor).execute("layer.selectBelow");
    expect(editor.activeLayer?.name).toBe("B");
    commandsOf(editor).execute("layer.select", { id: editor.drawing.layers[0].id });
    expect(editor.activeLayer?.name).toBe("A");
    expect(commandsOf(editor).isEnabled("layer.selectBelow")).toBe(false);
    expect(commandsOf(editor).isEnabled("layer.select", { id: "nope" })).toBe(false);
    expect(commandsOf(editor).isEnabled("layer.moveUp")).toBe(true);
    expect(commandsOf(new Editor(new Drawing(10, 10))).isEnabled("layer.selectAbove")).toBe(false);
  });

  it("can run every command that needs no params without params", () => {
    const editor = setup(["A", "B"]);
    for (const command of commandsOf(editor)
      .list()
      .filter((c) => !c.needsParams)) {
      expect(() => commandsOf(editor).isEnabled(command.id)).not.toThrow();
      expect(() => commandsOf(editor).execute(command.id)).not.toThrow();
    }
  });
});
