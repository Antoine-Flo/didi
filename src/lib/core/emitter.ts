// Minimal event emitter.
//
// A failing listener must never interrupt the change being notified (e.g. halfway through
// an undo), so its error is rethrown asynchronously instead: it still shows up as an
// uncaught error, but the other listeners and the caller run normally.

export class Emitter<T> {
  private listeners = new Set<(event: T) => void>();

  /** Calls `listener` for every event. Returns a function that unsubscribes. */
  subscribe(listener: (event: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: T) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
