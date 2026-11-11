// What the title bar shows: set by the page (the editor shows its document's name and its
// menus and layout menu, the tool's options instead of the name, and dims the bar while a dialog is open).

import type { Snippet } from "svelte";

export const windowTitle = $state<{
  name: string;
  dirty: boolean;
  menu: Snippet | null;
  /** Before the window buttons. */
  end: Snippet | null;
  /** After the menus, instead of the name, e.g. the tool's options. */
  center: Snippet | null;
  /** Dialogs are open: the bar is dimmed like the rest of the window, once per dialog. */
  dimLayers: number;
  /** No title bar: the page has its own (e.g. the preview window). */
  hidden: boolean;
}>({
  name: "Didi",
  dirty: false,
  menu: null,
  end: null,
  center: null,
  dimLayers: 0,
  hidden: false,
});
