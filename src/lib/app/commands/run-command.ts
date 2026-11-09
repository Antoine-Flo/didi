// Running a command from the interface. Buttons, shortcuts, menus and the command palette all
// go through here, so that the rules below hold wherever a command comes from.

import type { Painter } from "#lib/app/input/painter.js";
import type { Editor } from "#lib/core/editor/editor.js";

/** Runs a command, unless the pen is down. Returns whether it ran. */
export function runCommand(
  editor: Editor,
  painter: Pick<Painter, "active" | "finishing" | "drain">,
  id: string,
  params?: unknown,
): boolean {
  if (painter.active) {
    if (!painter.finishing) {
      return false;
    }
    // The pen is up but the stroke is still being painted: finish it first, so that undo, for
    // instance, applies to it.
    painter.drain();
  }
  if (!editor.commands.isEnabled(id, params)) {
    return false;
  }
  // Floating content belongs to a layer: lay it down before anything changes the layers.
  if (id.startsWith("layer.")) {
    editor.applySelection();
  }
  return editor.commands.execute(id, params);
}
