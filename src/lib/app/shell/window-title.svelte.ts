// What the title bar shows: set by the page (the editor shows its document's name and its
// menus and layout menu, the tool's options when compact, and dims the bar while a dialog is open).

import type { Snippet } from "svelte";

export const windowTitle = $state<{
  name: string;
  dirty: boolean;
  menu: Snippet | null;
  /** Before the window buttons. */
  end: Snippet | null;
  /** In the middle, instead of the name, e.g. the tool's options on a small screen. */
  center: Snippet | null;
  /** A dialog is open: the bar is dimmed like the rest of the window. */
  dimmed: boolean;
  /** No title bar: the page has its own (e.g. the preview window). */
  hidden: boolean;
}>({
  name: "Didi",
  dirty: false,
  menu: null,
  end: null,
  center: null,
  dimmed: false,
  hidden: false,
});
