// What the start screen will create: a mode (pixel art, painting…), chosen first, then a size
// and a background, which the mode preselects. The choice is kept while the app runs, and
// each change is told (to preview the new document), as long as the size is valid.

import type { Background } from "#lib/app/files/new-drawing.js";
import type { Mode } from "#lib/app/modes/mode.js";

/** The largest side of a new document, in pixels. */
export const MAX_SIZE = 8192;

export const validSize = (side: number) => Number.isInteger(side) && side >= 1 && side <= MAX_SIZE;

export type ChoiceListener = (
  width: number,
  height: number,
  background: Background,
  mode: string,
) => void;

export class NewDocumentChoice {
  // An id, not the mode itself: $state would wrap the mode in a proxy, and comparing it with
  // the modes would then always fail.
  private modeId = $state("");
  /** Bound to the custom size fields: call `edited` after a change there. */
  width = $state(0);
  height = $state(0);
  background = $state<Background>("white");

  /** Starts on `initial`'s defaults (the first mode if it isn't one of `modes`). */
  constructor(
    private readonly modes: readonly Mode[],
    initial: string,
    private readonly onchange?: ChoiceListener,
  ) {
    this.reset(this.find(initial));
  }

  get mode(): Mode {
    return this.find(this.modeId);
  }

  /** The size can be created. */
  get valid(): boolean {
    return validSize(this.width) && validSize(this.height);
  }

  /** Another mode: its own size and background. */
  choose(mode: Mode) {
    if (mode.id === this.modeId) {
      return;
    }
    this.reset(mode);
    this.edited();
  }

  setSize(width: number, height: number) {
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.edited();
  }

  setBackground(background: Background) {
    if (background === this.background) {
      return;
    }
    this.background = background;
    this.edited();
  }

  /** Tells the change, if the size is valid. */
  edited() {
    if (this.valid) {
      this.onchange?.(this.width, this.height, this.background, this.modeId);
    }
  }

  private find(id: string): Mode {
    return this.modes.find((mode) => mode.id === id) ?? this.modes[0];
  }

  private reset(mode: Mode) {
    this.modeId = mode.id;
    ({ width: this.width, height: this.height } = mode.newDocument.size);
    this.background = mode.newDocument.background;
  }
}
