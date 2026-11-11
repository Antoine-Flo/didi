// The open document, read by the interface. The core tells its changes by events, not by
// runes: what is read here, in an effect or a derived value, re-runs when the document tells
// a change of it (see `createSubscriber`). Read the document through here, not directly, and
// nothing is left showing an old state.

import { createSubscriber } from "svelte/reactivity";
import type { Editor } from "#lib/core/editor/editor.js";
import type { ReadonlyLayer } from "#lib/core/document/layer.js";
import type { History } from "#lib/core/history/history.js";

/** One stop for several subscriptions. */
function stopAll(...stops: (() => void)[]): () => void {
  return () => stops.forEach((stop) => stop());
}

/** One editor's subscriptions, started while something reads them. */
class Subscriptions {
  readonly layers: () => void;
  readonly active: () => void;
  readonly history: () => void;
  readonly anything: () => void;
  readonly pixels: () => void;

  constructor(readonly editor: Editor) {
    const { drawing, history, selection } = editor;
    // Pixels change on every frame of a stroke: only what shows them follows them.
    const layers = (update: () => void) =>
      drawing.subscribe((change) => change.type !== "pixels-changed" && update());
    this.layers = createSubscriber(layers);
    this.active = createSubscriber((update) =>
      stopAll(layers(update), editor.onActiveLayerChange(update)),
    );
    this.history = createSubscriber((update) => history.subscribe(update));
    this.anything = createSubscriber((update) =>
      stopAll(
        layers(update),
        history.subscribe(update),
        selection.subscribe(update),
        editor.onActiveLayerChange(update),
      ),
    );
    this.pixels = createSubscriber((update) =>
      drawing.subscribe((change) => change.type === "pixels-changed" && update()),
    );
  }
}

export class EditorChanges {
  private watchedNow: Subscriptions | null = null;
  // The canvas size, and a new view whenever it changes (cropped, scaled, turned…).
  private canvasSizeNow = $state({ width: 0, height: 0 });
  private resizesNow = $state(0);

  constructor(private readonly editor: () => Editor) {
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
  }

  /** The drawing's layers, the bottom one first. */
  get layers(): readonly ReadonlyLayer[] {
    const watched = this.watched();
    watched.layers();
    return watched.editor.drawing.layers;
  }

  get activeLayer(): ReadonlyLayer | null {
    const watched = this.watched();
    watched.active();
    return watched.editor.activeLayer;
  }

  /** The history, for what it can undo or redo. */
  get history(): History {
    const watched = this.watched();
    watched.history();
    return watched.editor.history;
  }

  /**
   * Re-runs the caller on any change but pixels: for what may depend on anything, like
   * whether a command can run.
   */
  track() {
    this.watched().anything();
  }

  /** Re-runs the caller whenever pixels change: on every frame of a stroke. */
  trackPixels() {
    this.watched().pixels();
  }

  get canvasSize(): { width: number; height: number } {
    return this.canvasSizeNow;
  }

  /** Changes of the canvas's size. */
  get resizes(): number {
    return this.resizesNow;
  }

  /** The open editor's subscriptions; another document has its own. */
  private watched(): Subscriptions {
    const editor = this.editor();
    if (this.watchedNow?.editor !== editor) {
      this.watchedNow = new Subscriptions(editor);
    }
    return this.watchedNow;
  }
}
