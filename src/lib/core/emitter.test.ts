import { afterEach, describe, expect, it, vi } from "vitest";
import { Emitter } from "./emitter";

describe("Emitter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls listeners until they unsubscribe", () => {
    const emitter = new Emitter<number>();
    const listener = vi.fn();
    const unsubscribe = emitter.subscribe(listener);
    emitter.emit(1);
    unsubscribe();
    emitter.emit(2);
    expect(listener.mock.calls).toEqual([[1]]);
  });

  it("keeps notifying other listeners when one throws, and rethrows asynchronously", () => {
    const deferred: (() => void)[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => void deferred.push(fn));
    const emitter = new Emitter<number>();
    const after = vi.fn();
    emitter.subscribe(() => {
      throw new Error("boom");
    });
    emitter.subscribe(after);

    expect(() => emitter.emit(1)).not.toThrow();
    expect(after).toHaveBeenCalledWith(1);
    expect(deferred).toHaveLength(1);
    expect(deferred[0]).toThrow("boom");
  });

  it("supports unsubscribing during an emit", () => {
    const emitter = new Emitter<number>();
    const second = vi.fn();
    const unsubscribeSecond = emitter.subscribe(() => unsubscribeSecond());
    emitter.subscribe(second);
    emitter.emit(1);
    emitter.emit(2);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
