// The File commands (new, open, save, export, import) and the app's own (command palette,
// shortcuts, preferences, about, quit).

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { AppHost } from "#lib/app/commands/app-commands.js";
import { m } from "#lib/paraglide/messages.js";

/** Registers the file and app commands. Returns a function that unregisters them. */
export function registerFileCommands(registry: CommandRegistry<Editor>, host: AppHost): () => void {
  const unregister = [
    registry.register({ id: "file.new", title: m.cmd_file_new(), run: () => host.newDocument() }),
    registry.register({
      id: "file.exportPng",
      title: m.cmd_file_export_png(),
      run: () => host.exportPng(),
    }),
    registry.register({
      id: "file.importImage",
      title: m.cmd_file_import_image(),
      run: () => host.importImage(),
    }),
    registry.register({
      id: "app.commandPalette",
      title: m.cmd_app_command_palette(),
      run: () => host.openCommandPalette(),
    }),
    registry.register({
      id: "app.shortcuts",
      title: m.cmd_app_shortcuts(),
      run: () => host.openShortcuts(),
    }),
    registry.register({
      id: "app.preferences",
      title: m.cmd_app_preferences(),
      run: () => host.openPreferences(),
    }),
    registry.register({ id: "app.about", title: m.cmd_app_about(), run: () => host.openAbout() }),
  ];
  if (host.canUseFiles) {
    unregister.push(
      registry.register<{ path?: string } | undefined>({
        id: "file.open",
        title: m.cmd_file_open(),
        run: (_, params) => host.openDocument(params?.path),
      }),
      registry.register({
        id: "file.save",
        title: m.cmd_file_save(),
        run: () => host.saveDocument(),
      }),
      registry.register({
        id: "file.saveAs",
        title: m.cmd_file_save_as(),
        run: () => host.saveDocumentAs(),
      }),
    );
  }
  const { quit } = host;
  if (quit) {
    unregister.push(registry.register({ id: "app.quit", title: m.cmd_app_quit(), run: quit }));
  }
  return () => unregister.forEach((fn) => fn());
}
