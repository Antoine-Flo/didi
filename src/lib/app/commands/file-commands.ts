// The File commands (new, open, save, export, import) and the app's own (command palette,
// shortcuts, preferences, about, quit).

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { DialogOpener } from "#lib/app/commands/app-commands.js";
import { m } from "#lib/paraglide/messages.js";

/** What the file and app commands act on. */
export interface FileHost extends DialogOpener {
  /** Whether documents can be opened and saved as files. Without it, no such commands. */
  readonly canUseFiles: boolean;
  /** Opens a document: asks which one, unless `path` is given (e.g. a recent file). */
  openDocument(path?: string): void;
  saveDocument(): void;
  saveDocumentAs(): void;
  exportPng(): void;
  importImage(): void;
  /** Closes the app (offering to save first). Null where it cannot: no such command. */
  readonly quit: (() => void) | null;
}

/** Registers the file and app commands. */
export function registerFileCommands(registry: CommandRegistry<Editor>, host: FileHost) {
  // The start screen, to create a document or open a recent one.
  registry.register({
    id: "file.new",
    title: m.cmd_file_new(),
    run: () => host.openDialog("start"),
  });
  registry.register({
    id: "file.exportPng",
    title: m.cmd_file_export_png(),
    run: () => host.exportPng(),
  });
  registry.register({
    id: "file.importImage",
    title: m.cmd_file_import_image(),
    run: () => host.importImage(),
  });
  registry.register({
    id: "app.commandPalette",
    title: m.cmd_app_command_palette(),
    run: () => host.openDialog("commandPalette"),
  });
  registry.register({
    id: "app.shortcuts",
    title: m.cmd_app_shortcuts(),
    run: () => host.openDialog("shortcuts"),
  });
  registry.register({
    id: "app.preferences",
    title: m.cmd_app_preferences(),
    run: () => host.openDialog("preferences"),
  });
  registry.register({
    id: "app.about",
    title: m.cmd_app_about(),
    run: () => host.openDialog("about"),
  });
  if (host.canUseFiles) {
    registry.register<{ path?: string } | undefined>({
      id: "file.open",
      title: m.cmd_file_open(),
      run: (_, params) => host.openDocument(params?.path),
    });
    registry.register({
      id: "file.save",
      title: m.cmd_file_save(),
      run: () => host.saveDocument(),
    });
    registry.register({
      id: "file.saveAs",
      title: m.cmd_file_save_as(),
      run: () => host.saveDocumentAs(),
    });
  }
  const { quit } = host;
  if (quit) {
    registry.register({ id: "app.quit", title: m.cmd_app_quit(), run: quit });
  }
}
