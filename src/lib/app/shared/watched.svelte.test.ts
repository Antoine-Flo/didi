// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { Emitter } from "#lib/core/shared/emitter.js";
import { Watched } from "#lib/app/shared/watched.svelte.js";

/** A core object: a value, and an event when it changes. */
class Counter {
  value = 0;
  private changes = new Emitter<void>();
  bump() {
    this.value++;
    this.changes.emit();
  }
  subscribe(listener: () => void) {
    return this.changes.subscribe(listener);
  }
}

let stop = () => {};
afterEach(() => stop());

function setup() {
  const watched = new Watched<Counter>();
  const seen: (number | null)[] = [];
  stop = $effect.root(() => {
    $effect(() => {
      seen.push(watched.current?.value ?? null);
    });
  });
  flushSync();
  return { watched, seen };
}

describe("Watched", () => {
  it("is null until set, then re-reads on each change it tells", () => {
    const { watched, seen } = setup();
    const counter = new Counter();
    watched.set(counter);
    flushSync();
    counter.bump();
    flushSync();
    counter.bump();
    flushSync();
    expect(seen).toEqual([null, 0, 1, 2]);
  });

  it("follows the object set last only", () => {
    const { watched, seen } = setup();
    const first = new Counter();
    const second = new Counter();
    watched.set(first);
    watched.set(second);
    flushSync();
    first.bump();
    flushSync();
    second.bump();
    flushSync();
    expect(seen).toEqual([null, 0, 1]);
  });
});
