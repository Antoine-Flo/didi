// Where testers tell what they think: a form for bugs, one for feedback (Tally), and the
// Discord; and the documentation. The forms are told in their URL, as hidden fields, which
// version runs where, and for a bug a few facts about the editor: nothing that says who the
// user is.

import type { SystemInfo } from "#lib/platform/system.js";

export const BUG_FORM = "https://tally.so/r/rDa0PX";
export const FEEDBACK_FORM = "https://tally.so/r/dba2rq";
export const DISCORD = "https://discord.gg/wjqSQDqNyg";
/** The documentation, online also from the desktop app. */
export const DOCS = "https://didipaint.com/doc/";

/** What the bug form is told about the editor, as it was when the user asked. */
export interface EditorFacts {
  /** The last pointer used: "pen", "touch", "mouse", or empty. */
  readonly input: string;
  /** The current tool, e.g. "pixel". */
  readonly tool: string;
  /** The document's size and layers, e.g. "64x64, 3 layers". */
  readonly doc: string;
  /** The window, in CSS pixels, and the pixel ratio, e.g. "1280x800@2". */
  readonly screen: string;
  /** "normal" or "compact". */
  readonly layout: string;
  /** The last error shown, or empty. */
  readonly error: string;
}

function withFields(form: string, fields: Record<string, string>): string {
  const url = new URL(form);
  for (const [name, value] of Object.entries(fields)) {
    if (value) {
      url.searchParams.set(name, value);
    }
  }
  return url.href;
}

export function feedbackUrl(version: string, system: SystemInfo): string {
  const { source, browser } = system;
  return withFields(FEEDBACK_FORM, { version, source, browser });
}

export function bugReportUrl(version: string, system: SystemInfo, facts: EditorFacts): string {
  const { source, browser, os } = system;
  // A long error would make the URL too long for some browsers.
  const error = facts.error.slice(0, 300);
  return withFields(BUG_FORM, { version, source, browser, os, ...facts, error });
}
