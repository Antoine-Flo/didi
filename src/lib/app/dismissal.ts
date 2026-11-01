// "Dismissal" clicks: the first click after a window or menu over the canvas closes, only
// closes it. It must not draw.
//
// Something that closes on an outside click (a native dialog, a popup menu…) calls
// `markDismissal()`. The next contact then consumes the mark: on the canvas it is ignored,
// anywhere else it works normally.

let pending = false;

/** The next contact closes something: it must not draw. */
export function markDismissal() {
  pending = true;
}

/** Called on every contact. Returns true if this contact is a dismissal click. */
export function consumeDismissal(): boolean {
  const was = pending;
  pending = false;
  return was;
}
