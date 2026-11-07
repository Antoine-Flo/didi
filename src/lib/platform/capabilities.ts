// What the app can do where it runs: the desktop app (Tauri) or a plain browser. The interface
// asks here what to show, rather than checking for Tauri, so that each difference has a name.

import { isTauri } from "@tauri-apps/api/core";

export const capabilities = {
  /** Its own window: minimize, maximize, move, close, quit. A browser has its own buttons. */
  ownWindow: isTauri(),
  /** Windows of its own besides the main one, e.g. the preview popped out. */
  windows: isTauri(),
  /** Documents as files on disk: open, save, recent files. */
  userFiles: isTauri(),
} as const;
