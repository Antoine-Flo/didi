import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commands";

function setup() {
  const ctx = { value: 0 };
  return { ctx, registry: new CommandRegistry(ctx) };
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

  it("does not run disabled commands", () => {
    const { registry } = setup();
    const run = vi.fn();
    registry.register({ id: "test.never", title: "Never", enabled: () => false, run });
    expect(registry.isEnabled("test.never")).toBe(false);
    expect(registry.execute("test.never")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("throws on unknown commands", () => {
    const { registry } = setup();
    expect(() => registry.execute("test.missing")).toThrow();
    expect(() => registry.isEnabled("test.missing")).toThrow();
  });
});
