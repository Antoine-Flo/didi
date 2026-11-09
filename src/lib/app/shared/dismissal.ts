// "Dismissal" clicks: the click that closes a popup over the canvas (a menu, a select)
// only closes it. It must not draw.
//
// Popups call `popupOpened` and `popupClosed`: while one is open, and shortly after it
// closes, contacts on the canvas are ignored. The press that closes a popup may reach the
// canvas just after it is gone, especially native pen events.

let openPopups = 0;
let closedAt = -Infinity;
/** How long after a popup closes a contact is still taken as the closing click. */
const AFTER_CLOSE_MS = 250;

export function popupOpened() {
  openPopups++;
}

export function popupClosed(now = performance.now()) {
  openPopups = Math.max(0, openPopups - 1);
  closedAt = now;
}

/** Called on every contact on the canvas. Returns true if it only closes a popup. */
export function consumeDismissal(now = performance.now()): boolean {
  return openPopups > 0 || now - closedAt < AFTER_CLOSE_MS;
}
