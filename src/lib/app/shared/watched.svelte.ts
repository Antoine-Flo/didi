// A core object, which tells its changes by events, not by runes, read by the interface:
// reading `current` in an effect or a derived value re-runs it on each change it tells.

import { createSubscriber } from "svelte/reactivity";

interface Subscribable {
  subscribe(listener: () => void): () => void;
}

export class Watched<T extends Subscribable> {
  private value = $state.raw<T | null>(null);
  private watch = () => {};

  /** The object, or null until it is set. */
  get current(): T | null {
    const value = this.value;
    this.watch();
    return value;
  }

  set(value: T) {
    this.watch = createSubscriber((update) => value.subscribe(update));
    this.value = value;
  }
}
