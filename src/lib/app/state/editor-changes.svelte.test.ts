// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { updateLayer } from "#lib/core/history/edits.js";
import { EditorChanges } from "#lib/app/state/editor-changes.svelte.js";

let stop = () => {};
afterEach(() => stop());

/** Two layers; counts how often each read re-runs. */
function setup() {
  const drawing = new Drawing(32, 32);
  drawing.addLayer(drawing.createLayer({ name: "A" }));
  drawing.addLayer(drawing.createLayer({ name: "B" }));
  const open = $state({ editor: new Editor(drawing) });
  const runs = { layers: 0, active: 0, history: 0, anything: 0, pixels: 0 };
  const seen = { names: [] as string[], active: "", undo: null as string | null };
  stop = $effect.root(() => {
    const changes = new EditorChanges(() => open.editor);
    $effect(() => {
      seen.names = changes.layers.map((l) => l.name);
      runs.layers++;
    });
    $effect(() => {
      seen.active = changes.activeLayer?.name ?? "";
      runs.active++;
    });
    $effect(() => {
      seen.undo = changes.history.undoLabel;
      runs.history++;
    });
    $effect(() => {
      changes.track();
      runs.anything++;
    });
    $effect(() => {
      changes.trackPixels();
      runs.pixels++;
    });
  });
  flushSync();
  const reset = () => Object.keys(runs).forEach((k) => (runs[k as keyof typeof runs] = 0));
  reset();
  return { open, runs, seen, reset };
}

const drawPixel = (editor: Editor) =>
  editor.drawing.writePixels(
    editor.activeLayer!.id,
    { x: 0, y: 0, width: 1, height: 1 },
    new Uint8ClampedArray([255, 0, 0, 255]),
  );

describe("EditorChanges", () => {
  it("re-reads the layers when they change, not their pixels", () => {
    const { open, runs, seen } = setup();
    const { drawing } = open.editor;
    drawing.updateLayer(drawing.layers[0].id, { name: "A2" });
    flushSync();
    expect(seen.names).toEqual(["A2", "B"]);
    expect(runs.layers).toBe(1);
    drawPixel(open.editor);
    flushSync();
    expect(runs.layers).toBe(1);
    expect(runs.pixels).toBe(1);
  });

  it("re-reads the active layer when another one is made active, or it changes", () => {
    const { open, runs, seen } = setup();
    const editor = open.editor;
    expect(seen.active).toBe("B");
    editor.setActiveLayer(editor.drawing.layers[0].id);
    flushSync();
    expect(seen.active).toBe("A");
    editor.drawing.updateLayer(editor.drawing.layers[0].id, { name: "A2" });
    flushSync();
    expect(seen.active).toBe("A2");
    expect(runs.active).toBe(2);
  });

  it("re-reads the history when it changes", () => {
    const { open, runs, seen } = setup();
    const editor = open.editor;
    editor.history.push(updateLayer(editor.drawing.layers[0].id, { name: "A2" }));
    flushSync();
    expect(seen.undo).not.toBeNull();
    editor.history.undo();
    flushSync();
    expect(seen.undo).toBeNull();
    expect(runs.history).toBe(2);
  });

  it("tracks every change but pixels", () => {
    const { open, runs, reset } = setup();
    const editor = open.editor;
    const changes: [string, () => void][] = [
      ["layers", () => editor.drawing.updateLayer(editor.drawing.layers[0].id, { name: "X" })],
      ["history", () => editor.history.push({ label: "Palette", apply() {}, revert() {} })],
      ["selection", () => editor.selection.setDraft({ rect: { x: 0, y: 0, width: 2, height: 2 } })],
      ["active layer", () => editor.setActiveLayer(editor.drawing.layers[0].id)],
    ];
    for (const [what, change] of changes) {
      reset();
      change();
      flushSync();
      expect(runs.anything, what).toBeGreaterThan(0);
    }
    reset();
    drawPixel(editor);
    flushSync();
    expect(runs.anything).toBe(0);
  });

  it("follows another document, and no longer the previous one", () => {
    const { open, runs, seen } = setup();
    const previous = open.editor;
    const drawing = new Drawing(16, 16);
    drawing.addLayer(drawing.createLayer({ name: "C" }));
    open.editor = new Editor(drawing);
    flushSync();
    expect(seen.names).toEqual(["C"]);
    expect(seen.active).toBe("C");
    drawing.updateLayer(drawing.layers[0].id, { name: "C2" });
    flushSync();
    expect(seen.names).toEqual(["C2"]);
    const before = { ...runs };
    previous.drawing.updateLayer(previous.drawing.layers[0].id, { name: "old" });
    drawPixel(previous);
    flushSync();
    expect(runs).toEqual(before);
  });

  it("stops listening once nothing reads it", async () => {
    const editor = new Editor(new Drawing(16, 16));
    // Every subscription to the document, as long as it lasts.
    const live = { started: 0, now: 0 };
    const counted = <A extends unknown[]>(subscribe: (...args: A) => () => void) =>
      vi.fn((...args: A) => {
        const unsubscribe = subscribe(...args);
        live.started++;
        live.now++;
        return () => {
          live.now--;
          unsubscribe();
        };
      });
    const { drawing, history, selection } = editor;
    drawing.subscribe = counted(drawing.subscribe.bind(drawing));
    history.subscribe = counted(history.subscribe.bind(history));
    selection.subscribe = counted(selection.subscribe.bind(selection));
    editor.onActiveLayerChange = counted(editor.onActiveLayerChange.bind(editor));
    const root = $effect.root(() => {
      const changes = new EditorChanges(() => editor);
      $effect(() => void changes.layers);
      $effect(() => void changes.activeLayer);
      $effect(() => void changes.history);
      $effect(() => changes.track());
      $effect(() => changes.trackPixels());
    });
    flushSync();
    // The canvas size's own subscription, then each read's.
    expect(live.started).toBe(1 + 1 + 2 + 1 + 4 + 1);
    root();
    await Promise.resolve();
    expect(live.now).toBe(0);
  });
});
