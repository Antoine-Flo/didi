// The preview of the whole drawing: over the canvas ("in"), or in a window of its own
// ("out"), which is sent the drawing while it is open.

import { sendToWindow } from "#lib/app/preview/preview-link.js";
import type { Drawing } from "#lib/core/document/drawing.js";
import { openPreviewWindow, type OpenWindow } from "#lib/platform/preview-window.js";

export type PreviewPlace = "off" | "in" | "out";

export class PreviewState {
  private placeNow = $state<PreviewPlace>("off");
  private window: OpenWindow | null = null;

  /** Sends `drawing` to the preview's window while it is open. */
  constructor(drawing: () => Drawing) {
    $effect(() => {
      if (this.placeNow === "out") {
        return sendToWindow(drawing());
      }
    });
  }

  get place(): PreviewPlace {
    return this.placeNow;
  }

  set place(next: PreviewPlace) {
    if (next === this.placeNow) {
      return;
    }
    if (this.placeNow === "out") {
      this.window?.close();
    }
    this.window = null;
    this.placeNow = next;
    if (next !== "out") {
      return;
    }
    const opened = openPreviewWindow(() => {
      if (this.window !== opened) {
        return;
      }
      this.window = null;
      this.placeNow = "off";
    });
    this.window = opened;
  }

  /** Closes its window, if open: the editor closes. */
  closeWindow() {
    this.window?.close();
  }
}
