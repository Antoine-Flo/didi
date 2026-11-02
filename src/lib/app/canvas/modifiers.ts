// The modifier keys held now (Shift, Ctrl, Alt), for tools: native pen events don't carry
// them. Follows the keyboard on the window; everything is released when the window loses
// the focus, as the key releases would be missed.

import type { Modifiers } from "#lib/app/tools/tool.js";

const held: Modifiers = { shift: false, ctrl: false, alt: false };
let listening = false;

function update(e: KeyboardEvent) {
  held.shift = e.shiftKey;
  held.ctrl = e.ctrlKey || e.metaKey;
  held.alt = e.altKey;
}

function release() {
  held.shift = held.ctrl = held.alt = false;
}

/** The keys held now. Starts following the keyboard on first use. */
export function heldModifiers(): Modifiers {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("keydown", update, true);
    window.addEventListener("keyup", update, true);
    window.addEventListener("blur", release);
  }
  return { ...held };
}
