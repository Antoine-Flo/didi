// Interface commands: modes, tools, brushes, colors, palettes, view, files, help. Most take no
// params, so they can be bound to shortcuts, listed in the command palette and later put in
// the quick wheel; those that need params are marked `needsParams`. Each domain gets only what it
// acts on (ToolHost, ViewHost…); the editor provides them all (see state/command-host.ts).

import type { MessageLevel } from "#lib/app/state/messages.svelte.js";
import type { DialogName } from "#lib/app/state/dialogs.svelte.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { registerColorCommands, type ColorHost } from "#lib/app/commands/color-commands.js";
import { registerEditCommands, type EditHost } from "#lib/app/commands/edit-commands.js";
import { registerFileCommands, type FileHost } from "#lib/app/commands/file-commands.js";
import { registerHelpCommands, type HelpHost } from "#lib/app/commands/help-commands.js";
import { registerToolCommands, type ToolHost } from "#lib/app/commands/tool-commands.js";
import { registerViewCommands, type ViewHost } from "#lib/app/commands/view-commands.js";

/** Opens a dialog, for the commands that only do that. */
export interface DialogOpener {
  openDialog(name: DialogName): void;
}

/** Shows a short message to the user, e.g. why a command did nothing. */
export interface Notifier {
  notify(message: string, level?: MessageLevel): void;
}

/** What all the interface's commands act on. */
export type AppHost = ToolHost & ViewHost & ColorHost & EditHost & FileHost & HelpHost;

/** Registers the interface commands. */
export function registerAppCommands(registry: CommandRegistry<Editor>, host: AppHost) {
  registerToolCommands(registry, host);
  registerViewCommands(registry, host);
  registerColorCommands(registry, host);
  registerEditCommands(registry, host);
  registerFileCommands(registry, host);
  registerHelpCommands(registry, host);
}
