// The modifier keys held now (Shift, Ctrl, Alt), for tools and for what shows them: native
// pen events don't carry them. Follows the keyboard and the pointer on the window; everything
// is released when the window loses the focus, as the key releases would be missed.

import type { Modifiers } from "#lib/app/tools/tool.js";

type KeyEventFields = Pick<
  KeyboardEvent,
  "type" | "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
>;

/**
 * The keys held after a key event. A key's own press or release is read from the event's key:
 * under GTK, the flags give the state before the event, so Alt still looks held on its release.
 */
export function modifiersAfter(e: KeyEventFields): Modifiers {
  const down = e.type === "keydown";
  return {
    shift: e.key === "Shift" ? down : e.shiftKey,
    ctrl: e.key === "Control" || e.key === "Meta" ? down : e.ctrlKey || e.metaKey,
    alt: e.key === "Alt" ? down : e.altKey,
  };
}

/** The keys held now. Reactive. */
export const held = $state<Modifiers>({ shift: false, ctrl: false, alt: false });

function onKey(e: KeyboardEvent) {
  Object.assign(held, modifiersAfter(e));
}

/** Pointer events have the right flags: this also catches a key release that was missed. */
function onPointer(e: PointerEvent) {
  held.shift = e.shiftKey;
  held.ctrl = e.ctrlKey || e.metaKey;
  held.alt = e.altKey;
}

function release() {
  held.shift = held.ctrl = held.alt = false;
}

// From the start, not on first use: a tool can need a key that was pressed before its stroke.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("pointermove", onPointer, true);
  window.addEventListener("blur", release);
}

/** A copy of the keys held now. */
export function heldModifiers(): Modifiers {
  return { ...held };
}
