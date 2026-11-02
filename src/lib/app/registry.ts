// A set of definitions by id (tools, modes…), in registration order. Built-in ones are
// registered like any other, so plugins can add theirs.

export class Registry<T extends { readonly id: string }> {
  private readonly items = new Map<string, T>();

  /** `kind` names the items in errors, e.g. "tool". */
  constructor(private readonly kind: string) {}

  /** Adds an item. Returns a function that removes it. */
  register(item: T): () => void {
    if (this.items.has(item.id)) throw new Error(`The ${this.kind} ${item.id} already exists`);
    this.items.set(item.id, item);
    return () => {
      if (this.items.get(item.id) === item) this.items.delete(item.id);
    };
  }

  get(id: string): T {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown ${this.kind} ${id}`);
    return item;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** In registration order. */
  list(): T[] {
    return [...this.items.values()];
  }
}
