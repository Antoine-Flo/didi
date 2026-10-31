import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commands";
import { Drawing } from "./drawing";
import type { Edit } from "./edits";
import { registerLayerCommands, type DrawingContext } from "./layer-commands";

const noopEdit: Edit = { label: "test", apply() {}, revert() {} };

function setup() {
  const ctx = { value: 0 };
  const commit = vi.fn();
  return { ctx, commit, registry: new CommandRegistry(ctx, commit) };
}

describe("CommandRegistry", () => {
  it("registers, lists and unregisters commands", () => {
    const { registry } = setup();
    const unregister = registry.register({ id: "test.a", title: "A", run() {} });
    expect(registry.has("test.a")).toBe(true);
    expect(registry.list().map((c) => c.id)).toEqual(["test.a"]);
    unregister();
    expect(registry.has("test.a")).toBe(false);
  });

  it("rejects duplicate and badly formed ids", () => {
    const { registry } = setup();
    registry.register({ id: "test.a", title: "A", run() {} });
    expect(() => registry.register({ id: "test.a", title: "A", run() {} })).toThrow();
    for (const id of ["test", "Test.a", "test.", "test..a", "test.a-b", ""]) {
      expect(() => registry.register({ id, title: "?", run() {} })).toThrow();
    }
  });

  it("does not let a stale unregister remove a newer command", () => {
    const { registry } = setup();
    const unregisterOld = registry.register({ id: "test.a", title: "old", run() {} });
    unregisterOld();
    registry.register({ id: "test.a", title: "new", run() {} });
    unregisterOld();
    expect(registry.get("test.a")?.title).toBe("new");
  });

  it("passes context and params to the command", () => {
    const { registry, ctx } = setup();
    registry.register<{ amount: number }>({
      id: "test.add",
      title: "Add",
      run: (c, { amount }) => {
        c.value += amount;
      },
    });
    expect(registry.execute("test.add", { amount: 3 })).toBe(true);
    expect(ctx.value).toBe(3);
  });

  it("commits the edits returned by commands, and only those", () => {
    const { registry, commit } = setup();
    registry.register({ id: "test.edit", title: "Edit", run: () => noopEdit });
    registry.register({ id: "test.view", title: "View", run() {} });
    registry.execute("test.view");
    expect(commit).not.toHaveBeenCalled();
    registry.execute("test.edit");
    expect(commit).toHaveBeenCalledWith(noopEdit);
  });

  it("does not run disabled commands", () => {
    const { registry, commit } = setup();
    const run = vi.fn(() => noopEdit);
    registry.register({ id: "test.never", title: "Never", enabled: () => false, run });
    expect(registry.isEnabled("test.never")).toBe(false);
    expect(registry.execute("test.never")).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("throws on unknown commands", () => {
    const { registry } = setup();
    expect(() => registry.execute("test.missing")).toThrow();
    expect(() => registry.isEnabled("test.missing")).toThrow();
  });
});

describe("layer commands", () => {
  function setupDrawing() {
    const drawing = new Drawing(100, 100);
    const ctx: DrawingContext = { drawing };
    const registry = new CommandRegistry(ctx, (edit) => edit.apply(drawing));
    const unregister = registerLayerCommands(registry);
    return { drawing, registry, unregister };
  }

  it("adds, updates, moves and removes layers", () => {
    const { drawing, registry } = setupDrawing();
    registry.execute("layer.add", { props: { name: "Fond" } });
    registry.execute("layer.add", { props: { name: "Encre" } });
    expect(drawing.layers.map((l) => l.name)).toEqual(["Fond", "Encre"]);

    const [fond, encre] = drawing.layers.map((l) => l.id);
    registry.execute("layer.update", { id: encre, changes: { opacity: 0.5 } });
    expect(drawing.getLayer(encre).opacity).toBe(0.5);

    registry.execute("layer.move", { id: encre, index: 0 });
    expect(drawing.layers.map((l) => l.id)).toEqual([encre, fond]);

    registry.execute("layer.remove", { id: fond });
    expect(drawing.layers.map((l) => l.id)).toEqual([encre]);
  });

  it("disables commands that target missing layers or invalid positions", () => {
    const { drawing, registry } = setupDrawing();
    registry.execute("layer.add");
    const id = drawing.layers[0].id;
    expect(registry.isEnabled("layer.remove", { id: "nope" })).toBe(false);
    expect(registry.isEnabled("layer.update", { id: "nope", changes: {} })).toBe(false);
    expect(registry.isEnabled("layer.move", { id, index: 0 })).toBe(false);
    expect(registry.isEnabled("layer.move", { id, index: 3 })).toBe(false);
  });

  it("unregisters all layer commands", () => {
    const { registry, unregister } = setupDrawing();
    unregister();
    expect(registry.list()).toEqual([]);
  });
});
