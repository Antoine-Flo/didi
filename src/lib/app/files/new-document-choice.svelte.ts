// What the start screen will create: a size and a background. The choice is kept while the app
// runs, and each change is told (to preview the new document), as long as the size is valid.

import type { Background } from "#lib/app/files/new-drawing.js";
import { m } from "#lib/paraglide/messages.js";

/** The largest side of a new document, in pixels. */
export const MAX_SIZE = 8192;

/** Sizes in one click, by group. */
export const SIZE_PRESETS: { group: string; sizes: [width: number, height: number][] }[] = [
  { group: m.start_sizes_sprites_tiles(), sizes: [16, 32, 64, 128, 256].map((s) => [s, s]) },
  {
    group: m.start_sizes_screen(),
    sizes: [
      [160, 144],
      [320, 180],
      [480, 270],
      [640, 360],
    ],
  },
];

/** A new document's size and background, until the user changes them. */
export const NEW_DOCUMENT = { width: 64, height: 64, background: "transparent" as Background };

export const validSize = (side: number) => Number.isInteger(side) && side >= 1 && side <= MAX_SIZE;

export type ChoiceListener = (width: number, height: number, background: Background) => void;

export class NewDocumentChoice {
  /** Bound to the custom size fields: call `edited` after a change there. */
  width = $state(NEW_DOCUMENT.width);
  height = $state(NEW_DOCUMENT.height);
  background = $state<Background>(NEW_DOCUMENT.background);

  constructor(private readonly onchange?: ChoiceListener) {}

  /** The size can be created. */
  get valid(): boolean {
    return validSize(this.width) && validSize(this.height);
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
      this.onchange?.(this.width, this.height, this.background);
    }
  }
}
