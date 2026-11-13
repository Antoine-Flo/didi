// Running a command from the interface. Buttons, shortcuts, menus and the command palette all
// go through here, so that the rules below hold wherever a command comes from.

import type { Painter } from "#lib/app/input/painter.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";

/** Runs a command on `editor`, unless the pen is down. Returns whether it ran. */
export function runCommand(
  commands: CommandRegistry<Editor>,
  editor: Editor,
  painter: Pick<Painter, "active">,
  id: string,
  params?: unknown,
): boolean {
  if (painter.active || !commands.isEnabled(id, params)) {
    return false;
  }
  // Floating content belongs to a layer: lay it down before anything changes the layers.
  if (id.startsWith("layer.")) {
    editor.applySelection();
  }
  return commands.execute(id, params);
}
