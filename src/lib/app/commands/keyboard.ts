/** Whether a keyboard event comes from a text field, where shortcuts must not apply. */
export function isTyping(e: Event): boolean {
  // The target can be the window or the document, which are not elements.
  if (!(e.target instanceof Element)) {
    return false;
  }
  const field = e.target.closest("input, select, textarea");
  return field !== null && takesText(field.tagName, field.getAttribute("type"));
}

// Inputs where nothing is typed: shortcuts keep working after a slider or a checkbox has
// been used. Their own keys (arrows, Home, End, Space) are not shortcuts.
const NOT_TEXT = new Set([
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "button",
  "submit",
  "reset",
  "image",
]);

/** Whether a form field (`tagName`, `type` attribute) takes typed text. */
export function takesText(tagName: string, type: string | null): boolean {
  if (tagName.toUpperCase() !== "INPUT") {
    return true;
  }
  // Like browsers, a missing or unknown type is a text field.
  return !NOT_TEXT.has((type ?? "text").toLowerCase());
}
