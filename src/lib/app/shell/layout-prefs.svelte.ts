// The user's layout preferences, saved in the app data folder so they are kept from one
// session to the next: the hand (the tools on the left for right-handed users, on the right
// for left-handed ones) and the sizes of resizable panels, in pixels, by panel id (e.g.
// "palette"; a panel without a size has its default one, see the Splitter widget). The
// same in every mode: switching modes moves nothing.

import { readDataFile, writeDataFile } from "#lib/platform/storage.js";

const FILE = "layout.json";
const VERSION = 1;
const SAVE_DELAY_MS = 300;

export type Hand = "right" | "left";

export interface LayoutPrefsData {
  hand: Hand;
  sizes: Record<string, number>;
}

/** The preferences in a saved file. Anything unexpected is ignored: they are not precious. */
export function parseLayoutPrefs(text: string): Partial<LayoutPrefsData> {
  const prefs: Partial<LayoutPrefsData> = {};
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) return prefs;
  if ("hand" in data && (data.hand === "right" || data.hand === "left")) prefs.hand = data.hand;
  if ("sizes" in data && typeof data.sizes === "object" && data.sizes !== null) {
    const sizes: Record<string, number> = {};
    for (const [id, size] of Object.entries(data.sizes)) {
      if (typeof size === "number" && Number.isFinite(size) && size > 0) sizes[id] = size;
    }
    prefs.sizes = sizes;
  }
  return prefs;
}

export class LayoutPrefs {
  private data = $state<LayoutPrefsData>({ hand: "right", sizes: {} });
  /** Changed before loading: kept over the saved values. */
  private changed: { hand?: true; sizes: string[] } = { sizes: [] };
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onError: (message: string) => void = () => {};

  get hand(): Hand {
    return this.data.hand;
  }

  set hand(hand: Hand) {
    if (hand === this.data.hand) return;
    this.data.hand = hand;
    if (!this.loaded) this.changed.hand = true;
    this.scheduleSave();
  }

  /** The size of a panel, or undefined for its default size. */
  size(id: string): number | undefined {
    return this.data.sizes[id];
  }

  setSize(id: string, size: number) {
    this.data.sizes[id] = Math.round(size);
    if (!this.loaded) this.changed.sizes.push(id);
    this.scheduleSave();
  }

  /** Back to the default size. */
  resetSize(id: string) {
    if (!(id in this.data.sizes)) return;
    delete this.data.sizes[id];
    if (!this.loaded) this.changed.sizes.push(id);
    this.scheduleSave();
  }

  /** Reads the saved preferences. Those changed before keep their value. */
  async load(onError: (message: string) => void): Promise<void> {
    this.onError = onError;
    try {
      const text = await readDataFile(FILE);
      if (text !== null) {
        const saved = parseLayoutPrefs(text);
        if (saved.hand && !this.changed.hand) this.data.hand = saved.hand;
        for (const [id, size] of Object.entries(saved.sizes ?? {})) {
          if (!this.changed.sizes.includes(id)) this.data.sizes[id] = size;
        }
      }
    } catch {
      // An unreadable file only loses the preferences: start from the defaults.
    }
    this.loaded = true;
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  async flush(): Promise<void> {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    await this.save();
  }

  private scheduleSave() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  private async save() {
    this.timer = null;
    // Before loading, saving would overwrite the file with the defaults: try again later.
    if (!this.loaded) return this.scheduleSave();
    const text = JSON.stringify({ version: VERSION, ...this.data }, null, 2) + "\n";
    try {
      await writeDataFile(FILE, text);
    } catch (e) {
      this.onError(`Layout could not be saved: ${e instanceof Error ? e.message : e}`);
    }
  }
}
