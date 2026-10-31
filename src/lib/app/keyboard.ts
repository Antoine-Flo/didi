/** Whether a keyboard event comes from a text field, where shortcuts must not apply. */
export function isTyping(e: Event): boolean {
  // The target can be the window or the document, which are not elements.
  return e.target instanceof Element && e.target.closest("input, select, textarea") !== null;
}
