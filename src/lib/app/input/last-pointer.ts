// The kind of the last pointer pressed anywhere in the editor (pen, touch or mouse), told in
// bug reports: most input bugs depend on it.

let last = "";

/** The last pointer's kind, or empty if none was pressed yet. */
export const lastPointer = () => last;

/** A pointer pressed outside the DOM's events: the native pen (Linux). */
export function pointerPressed(kind: string) {
  last = kind;
}

/** Follows the DOM's pointers from now on. Returns what stops it. */
export function watchLastPointer(): () => void {
  const onDown = (e: PointerEvent) => (last = e.pointerType);
  window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  return () => window.removeEventListener("pointerdown", onDown, { capture: true });
}
