// Popups (menus, the brushes…) keep away from the window's edges, and from the title bar:
// it stays above everything (so the window can always be moved and closed), and would hide
// the top of a popup.

const EDGE = 8;

/** Measured: the token is a calculation, which only the browser can resolve. */
function titlebarHeight(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position: absolute; visibility: hidden; height: var(--titlebar-height)";
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/** Collision padding for Bits UI popups. */
export function popupPadding(): { top: number; right: number; bottom: number; left: number } {
  const titlebar = typeof document === "undefined" ? 0 : titlebarHeight();
  return { top: titlebar + EDGE, right: EDGE, bottom: EDGE, left: EDGE };
}
