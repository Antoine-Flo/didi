// Command registry: every user action is a named command.
//
// Shortcuts, menus, the quick wheel and plugins all go through here. Params must be
// JSON-serializable, so they can be stored in keymaps and wheels. Undoable commands push
// their edits to the history themselves.

export interface Command<Ctx, P = void> {
  /** Namespaced id, e.g. "layer.add" or "myplugin.doThing". */
  readonly id: string;
  /** Shown in menus and the command palette. */
  readonly title: string;
  /** Whether the command can run now. Defaults to true. */
  enabled?(ctx: Ctx, params: P): boolean;
  run(ctx: Ctx, params: P): void;
}

const ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

export class CommandRegistry<Ctx> {
  // Params are checked by each command's own types at definition time.
  private commands = new Map<string, Command<Ctx, never>>();

  /** @param context passed to every command. */
  constructor(private readonly context: Ctx) {}

  /** Registers a command. Returns a function that unregisters it. */
  register<P>(command: Command<Ctx, P>): () => void {
    if (!ID_PATTERN.test(command.id)) throw new Error(`Invalid command id "${command.id}"`);
    if (this.commands.has(command.id)) throw new Error(`Command "${command.id}" already exists`);
    this.commands.set(command.id, command as Command<Ctx, never>);
    return () => {
      if (this.commands.get(command.id) === command) this.commands.delete(command.id);
    };
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  get(id: string): Command<Ctx, never> | undefined {
    return this.commands.get(id);
  }

  list(): Command<Ctx, never>[] {
    return [...this.commands.values()];
  }

  isEnabled(id: string, params?: unknown): boolean {
    const command = this.require(id);
    return command.enabled?.(this.context, params as never) ?? true;
  }

  /** Runs a command. Returns false if it is disabled. Throws if it does not exist. */
  execute(id: string, params?: unknown): boolean {
    const command = this.require(id);
    if (!(command.enabled?.(this.context, params as never) ?? true)) return false;
    command.run(this.context, params as never);
    return true;
  }

  private require(id: string): Command<Ctx, never> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command "${id}"`);
    return command;
  }
}
