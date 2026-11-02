// Popups (menus, the brushes…) keep away from the window's edges, and from the title bar:
// it stays above everything (so the window can always be moved and closed), and would hide
// the top of a popup.

const EDGE = 8;

/** Collision padding for Bits UI popups. */
export function popupPadding(): { top: number; right: number; bottom: number; left: number } {
  const titlebar =
    typeof document === "undefined"
      ? 0
      : parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--titlebar-height"),
        ) || 0;
  return { top: titlebar + EDGE, right: EDGE, bottom: EDGE, left: EDGE };
}
