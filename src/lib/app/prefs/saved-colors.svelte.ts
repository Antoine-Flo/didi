// The current and second colors, kept from one session to the next in the app data folder
// (colors.json). Followed once created: every change is saved, a moment later.

import { untrack } from "svelte";
import { DataFile } from "#lib/app/shared/data-file.js";
import type { ToolOptions } from "#lib/app/tools/tool.js";
import { fromHex, toHex, type RGB } from "#lib/core/color/color.js";
import { m } from "#lib/paraglide/messages.js";

const VERSION = 2;

/** A saved color: "#rrggbb", or null for none. Undefined if invalid. */
function parseColor(value: unknown): RGB | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? (fromHex(value) ?? undefined) : undefined;
}

/**
 * The colors in a saved file: null if it has none, or not both. Anything unexpected is
 * ignored: they are not precious.
 */
export function parseSavedColors(
  text: string,
): { color: RGB | null; secondary: RGB | null } | null {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || !("color" in data) || !("secondary" in data)) {
    return null;
  }
  const color = parseColor(data.color);
  const secondary = parseColor(data.secondary);
  return color !== undefined && secondary !== undefined ? { color, secondary } : null;
}

export class SavedColors {
  private readonly file = new DataFile("colors.json", {
    content: () => {
      const hex = (c: RGB | null) => (c ? toHex(c) : null);
      return {
        version: VERSION,
        color: hex(this.options.color),
        secondary: hex(this.options.secondary),
      };
    },
    saveFailed: (error) => m.app_colors_save_failed({ error }),
  });

  /** Follows the colors of `options` from now on (call while an effect may be created). */
  constructor(private readonly options: ToolOptions) {
    $effect(() => {
      void options.color;
      void options.secondary;
      untrack(() => {
        if (this.file.loaded) {
          this.file.scheduleSave();
        }
      });
    });
  }

  /** Takes the saved colors, if any. Changes are saved from then on. */
  async load(onError: (message: string) => void): Promise<void> {
    this.file.onError = onError;
    try {
      const text = await this.file.load();
      const saved = text === null ? null : parseSavedColors(text);
      if (saved) {
        this.options.color = saved.color;
        this.options.secondary = saved.secondary;
      }
    } catch {
      // An unreadable file only loses the colors.
    }
    this.file.markLoaded();
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  flush(): Promise<void> {
    return this.file.flush();
  }
}
