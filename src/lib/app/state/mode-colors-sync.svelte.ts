// The colors in use belong to the document's mode, kept from one session to the next (see
// ModeColors). Switching modes keeps the colors where they were and takes the other mode's.

import { untrack } from "svelte";
import type { ModeColors } from "#lib/app/prefs/mode-colors.svelte.js";
import type { ToolOptions } from "#lib/app/tools/tool.js";

export class ModeColorsSync {
  /** The mode the colors in use belong to. */
  private colorsMode: string;

  constructor(
    private readonly colors: ModeColors,
    private readonly options: ToolOptions,
    mode: () => string,
  ) {
    this.colorsMode = untrack(mode);
    $effect.pre(() => {
      const id = mode();
      untrack(() => {
        if (id !== this.colorsMode) {
          this.colorsMode = id;
          this.apply(id);
        }
      });
    });
    $effect(() => {
      void options.color;
      void options.secondary;
      untrack(() => this.keep());
    });
  }

  /** Loads the saved colors, then takes the current mode's. */
  async load(onError: (message: string) => void) {
    await this.colors.load(onError);
    this.apply(this.colorsMode);
    this.keep();
  }

  /** Takes a mode's saved current and second colors, if it has some. */
  private apply(id: string) {
    const saved = this.colors.current(id);
    if (saved) {
      this.options.color = saved.color;
      this.options.secondary = saved.secondary;
    }
  }

  /** Keeps the colors in use, for their mode. */
  private keep() {
    this.colors.setCurrent(
      this.colorsMode,
      $state.snapshot(this.options.color),
      $state.snapshot(this.options.secondary),
    );
  }
}
