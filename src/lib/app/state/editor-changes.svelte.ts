// Follows the open document's changes, for the interface to re-read it.

import { untrack } from "svelte";
import type { Editor } from "#lib/core/editor/editor.js";

export class EditorChanges {
  // Bumped on every change but pixels, so the UI re-reads the editor. Pixels change on every
  // frame of a stroke: only what shows them follows `pixelVersion`.
  private versionNow = $state(0);
  private pixelVersionNow = $state(0);
  // The canvas size, and a new view whenever it changes (cropped, scaled, turned…).
  private canvasSizeNow = $state({ width: 0, height: 0 });
  private resizesNow = $state(0);

  constructor(editor: () => Editor) {
    $effect(() => {
      const { drawing } = editor();
      this.canvasSizeNow = { width: drawing.width, height: drawing.height };
      return drawing.subscribe((change) => {
        if (change.type !== "canvas-resized") {
          return;
        }
        this.canvasSizeNow = { width: drawing.width, height: drawing.height };
        this.resizesNow++;
      });
    });
    $effect(() => {
      const current = editor();
      const bump = () => this.versionNow++;
      // Untracked: this effect must not depend on `version`, which it changes.
      untrack(bump);
      const unsubscribe = [
        current.drawing.subscribe((change) => {
          if (change.type === "pixels-changed") {
            this.pixelVersionNow++;
          } else {
            bump();
          }
        }),
        current.history.subscribe(bump),
        current.selection.subscribe(bump),
        current.onActiveLayerChange(bump),
      ];
      return () => unsubscribe.forEach((fn) => fn());
    });
  }

  /** Changes but pixels. */
  get version(): number {
    return this.versionNow;
  }

  /** Changes of pixels. */
  get pixelVersion(): number {
    return this.pixelVersionNow;
  }

  get canvasSize(): { width: number; height: number } {
    return this.canvasSizeNow;
  }

  /** Changes of the canvas's size. */
  get resizes(): number {
    return this.resizesNow;
  }
}
