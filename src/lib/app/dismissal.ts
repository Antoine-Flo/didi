// "Dismissal" clicks: the first click after a window or menu over the canvas closes, only
// closes it. It must not draw.
//
// Something that closes on an outside click (a native dialog…) calls `markDismissal()`.
// The next contact then consumes the mark: on the canvas it is ignored, anywhere else it
// works normally.
//
// In-app popups (menus, selects) call `popupOpened` and `popupClosed`: while one is open,
// and shortly after it closes, contacts on the canvas are ignored. The press that closes a
// popup may reach the canvas just after it is gone, especially native pen events.

let pending = false;
let openPopups = 0;
let closedAt = -Infinity;
/** How long after a popup closes a contact is still taken as the closing click. */
const AFTER_CLOSE_MS = 250;

/** The next contact closes something: it must not draw. */
export function markDismissal() {
  pending = true;
}

export function popupOpened() {
  openPopups++;
}

export function popupClosed(now = performance.now()) {
  openPopups = Math.max(0, openPopups - 1);
  closedAt = now;
}

/** Called on every contact. Returns true if this contact is a dismissal click. */
export function consumeDismissal(now = performance.now()): boolean {
  const was = pending || openPopups > 0 || now - closedAt < AFTER_CLOSE_MS;
  pending = false;
  return was;
}
