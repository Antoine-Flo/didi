// Editor modes: pixel art, painting… A mode only chooses what is shown. Every tool stays
// usable in every mode (from the command palette), and a tool behaves the same in all
// modes. The layout is shared too: a mode changes what the panels hold, not where they are.
//
// A mode is plain data, registered like the tools (see `builtin.ts`). Each document
// remembers its mode (saved in the .didi file).

import type { Component } from "svelte";
import type { Binding } from "#lib/app/commands/keymap.js";
import type { Background } from "#lib/app/files/new-drawing.js";
import { Registry } from "#lib/app/registry.js";

/** What the start screen offers to create a document in a mode. */
export interface NewDocumentOptions {
  /** Sizes in one click, by group. */
  presets: { group: string; sizes: [width: number, height: number][] }[];
  /** Preselected in the custom size fields. */
  size: { width: number; height: number };
  background: Background;
}

export interface Mode {
  /** Unique, e.g. "pixel". Saved in documents; its command is `mode.<id>`. */
  readonly id: string;
  /** In English, e.g. "Pixel art". */
  readonly title: string;
  readonly icon: Component<{ class?: string }>;
  /** One line for the start screen, e.g. "Sprites, tiles, animation". */
  readonly description: string;
  readonly newDocument: NewDocumentOptions;
  /** Tool ids of the tool bar, in order. The first one is active when entering the mode. */
  readonly tools: readonly string[];
  /** The tool of the pen's eraser end. */
  readonly eraserTool: string;
  /** The selection tool of this mode, for the shortcuts choosing a selection's shape. */
  readonly selectTool: string;
  /** Shortcuts of this mode, added to the common ones (and winning over them). */
  readonly bindings: readonly Binding[];
}

/** The mode of documents that have none (files from before modes). */
export const DEFAULT_MODE = "painting";

/** The mode chosen at start, for the first new document. */
export const START_MODE = "pixel";

export class ModeRegistry extends Registry<Mode> {
  constructor() {
    super("mode");
  }

  /** The mode with this id, or the default one if it is unknown (e.g. a missing plugin). */
  resolve(id: string | null): Mode {
    return id !== null && this.has(id) ? this.get(id) : this.get(DEFAULT_MODE);
  }
}
