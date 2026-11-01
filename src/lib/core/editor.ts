// An editing session: a drawing, its history, the commands and the active layer.
//
// The active layer is editor state, not part of the drawing, and is not undoable. It is
// kept valid after every history change.

import { CommandRegistry } from "./commands";
import type { Drawing } from "./drawing";
import { Emitter } from "./emitter";
import { History, type HistoryOptions } from "./history";
import type { ReadonlyLayer } from "./layer";
import { registerEditorCommands } from "./editor-commands";

export class Editor {
  readonly history: History;
  readonly commands: CommandRegistry<Editor>;
  private activeId: string | null = null;
  private activeChanges = new Emitter<string | null>();
  /** Last known index of the active layer, to pick a neighbor if it disappears. */
  private activeIndex = 0;

  constructor(
    readonly drawing: Drawing,
    options: HistoryOptions = {},
  ) {
    this.history = new History(drawing, options);
    this.history.subscribe(() => this.keepActiveLayerValid());
    this.commands = new CommandRegistry<Editor>(this);
    registerEditorCommands(this.commands);
    // Start on the top layer, like most drawing apps.
    this.activeIndex = Math.max(0, drawing.layers.length - 1);
    this.keepActiveLayerValid();
  }

  get activeLayer(): ReadonlyLayer | null {
    return this.activeId === null ? null : this.drawing.getLayer(this.activeId);
  }

  setActiveLayer(id: string | null) {
    if (id !== null) this.activeIndex = this.drawing.indexOf(id);
    this.setActiveId(id);
  }

  /** Calls `listener` with the new active layer id whenever it changes. */
  onActiveLayerChange(listener: (id: string | null) => void): () => void {
    return this.activeChanges.subscribe(listener);
  }

  private setActiveId(id: string | null) {
    if (id === this.activeId) return;
    this.activeId = id;
    this.activeChanges.emit(id);
  }

  private keepActiveLayerValid() {
    const layers = this.drawing.layers;
    const index = layers.findIndex((l) => l.id === this.activeId);
    if (index >= 0) {
      this.activeIndex = index;
      return;
    }
    if (layers.length === 0) {
      this.setActiveId(null);
      return;
    }
    this.activeIndex = Math.min(this.activeIndex, layers.length - 1);
    this.setActiveId(layers[this.activeIndex].id);
  }
}
