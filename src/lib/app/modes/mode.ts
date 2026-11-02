// Editor modes: pixel art, painting… A mode only chooses what is shown. Every tool stays
// usable in every mode (from the "more tools" menu or the command palette), and a tool
// behaves the same in all modes. The layout is shared too: a mode changes what the panels
// hold, not where they are.
//
// A mode is plain data, registered like the tools (see `builtin.ts`). Each document
// remembers its mode (saved in the .didi file).

import type { Component } from "svelte";
import type { Binding } from "#lib/app/commands/keymap.js";
import { Registry } from "#lib/app/registry.js";

/** Panels that only some modes show. */
export type OptionalPanel = "brushes";

export interface Mode {
  /** Unique, e.g. "pixel". Saved in documents; its command is `mode.<id>`. */
  readonly id: string;
  /** In English, e.g. "Pixel art". */
  readonly title: string;
  readonly icon: Component<{ size?: number }>;
  /** Tool ids of the tool bar, in order. The first one is active when entering the mode. */
  readonly tools: readonly string[];
  /** The tool of the pen's eraser end. */
  readonly eraserTool: string;
  readonly panels: readonly OptionalPanel[];
  /** Shortcuts of this mode, added to the common ones (and winning over them). */
  readonly bindings: readonly Binding[];
}

/** The mode of documents that have none (files from before modes). */
export const DEFAULT_MODE = "painting";

export class ModeRegistry extends Registry<Mode> {
  constructor() {
    super("mode");
  }

  /** The mode with this id, or the default one if it is unknown (e.g. a missing plugin). */
  resolve(id: string | null): Mode {
    return id !== null && this.has(id) ? this.get(id) : this.get(DEFAULT_MODE);
  }
}
