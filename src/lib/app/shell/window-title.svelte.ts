// What the title bar shows: set by the page (the editor shows its document's name and its
// menus and layout menu, and dims the bar while a dialog is open).

import type { Snippet } from "svelte";

export const windowTitle = $state<{
  name: string;
  dirty: boolean;
  menu: Snippet | null;
  /** Before the window buttons. */
  end: Snippet | null;
  /** A dialog is open: the bar is dimmed like the rest of the window. */
  dimmed: boolean;
}>({
  name: "Didi",
  dirty: false,
  menu: null,
  end: null,
  dimmed: false,
});
