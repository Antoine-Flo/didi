// The preview's own window (see app/preview), in the desktop app: it can be moved to another
// screen. A browser has none (see capabilities.windows): the preview stays over the canvas.

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { capabilities } from "./capabilities";
import { m } from "#lib/paraglide/messages.js";

const LABEL = "preview";
const URL = "/preview";
const SIZE = 360;

/** Closes the preview window, if open. */
export interface OpenWindow {
  close(): void;
}

/** Opens the preview window; `onClosed` is called when it closes, however it is closed. */
export function openPreviewWindow(onClosed: () => void): OpenWindow {
  const preview = new WebviewWindow(LABEL, {
    url: URL,
    title: m.window_preview(),
    width: SIZE,
    height: SIZE,
    minWidth: 120,
    minHeight: 120,
    decorations: false,
  });
  let closed = false;
  const done = () => {
    if (closed) {
      return;
    }
    closed = true;
    onClosed();
  };
  void preview.once("tauri://destroyed", done);
  void preview.once("tauri://error", done);
  return { close: () => void preview.destroy() };
}

/** A preview left open by a reload of the editor: the editor no longer knows about it. */
export async function closeStalePreview() {
  if (capabilities.windows) {
    await (await WebviewWindow.getByLabel(LABEL))?.destroy();
  }
}
