// Popups (menus, the brushes…) keep away from the window's edges, and from the title bar:
// it stays above everything (so the window can always be moved and closed), and would hide
// the top of a popup.

const EDGE = 8;

/** A length in pixels, e.g. "var(--space)": tokens are calculations only the browser resolves. */
export function cssLength(length: string): number {
  if (typeof document === "undefined") {
    return 0;
  }
  const probe = document.createElement("div");
  probe.style.cssText = `position: absolute; visibility: hidden; height: ${length}`;
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/** Collision padding for Bits UI popups. */
export function popupPadding(): { top: number; right: number; bottom: number; left: number } {
  const titlebar = cssLength("var(--titlebar-height)");
  return { top: titlebar + EDGE, right: EDGE, bottom: EDGE, left: EDGE };
}
