// The user's layout preferences, saved in the app data folder so they are kept from one
// session to the next: the hand (the panels on the left for right-handed users, on the
// right for left-handed ones), where the tool column sits along it, the interface size, and
// whether the layout is compact, whether the panels' column is open (on a wide window; see EditorApp), the sizes of
// resizable panels, in pixels at 100% interface size, by panel id (e.g.
// "palette"; a panel without a size has its default one, see the Splitter widget). The
// same in every mode: switching modes moves nothing.

import { errorMessage } from "#lib/app/error-message.js";
import { readDataFile, writeDataFile } from "#lib/platform/storage.js";
import { m } from "#lib/paraglide/messages.js";

const FILE = "layout.json";
const VERSION = 1;
const SAVE_DELAY_MS = 300;

export type Hand = "right" | "left";
/** The compact layout: on a small window ("auto"), always, or never. */
export type CompactMode = "auto" | "on" | "off";
const COMPACT_MODES: readonly CompactMode[] = ["auto", "on", "off"];

/** The interface size, in percent. Barely below 100: the interface is already compact. */
export const UI_SCALE_MIN = 90;
export const UI_SCALE_MAX = 150;
export const UI_SCALE_STEP = 5;

export interface LayoutPrefsData {
  hand: Hand;
  /** The tool column's place along the panels: 0 at the top, 1 at the bottom. */
  toolsPosition: number;
  /** The interface size, in percent. */
  uiScale: number;
  /** The panels' column is shown. */
  panelsOpen: boolean;
  /** The pixels' grid shows when zoomed in. */
  pixelGrid: boolean;
  compact: CompactMode;
  sizes: Record<string, number>;
}

const DEFAULT_TOOLS_POSITION = 0;

/** The preferences in a saved file. Anything unexpected is ignored: they are not precious. */
export function parseLayoutPrefs(text: string): Partial<LayoutPrefsData> {
  const prefs: Partial<LayoutPrefsData> = {};
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) return prefs;
  if ("hand" in data && (data.hand === "right" || data.hand === "left")) prefs.hand = data.hand;
  if ("toolsPosition" in data) {
    const p = data.toolsPosition;
    if (typeof p === "number" && p >= 0 && p <= 1) prefs.toolsPosition = p;
  }
  if ("uiScale" in data) {
    const s = data.uiScale;
    if (
      typeof s === "number" &&
      s >= UI_SCALE_MIN &&
      s <= UI_SCALE_MAX &&
      s % UI_SCALE_STEP === 0
    ) {
      prefs.uiScale = s;
    }
  }
  if ("panelsOpen" in data && typeof data.panelsOpen === "boolean") {
    prefs.panelsOpen = data.panelsOpen;
  }
  if ("pixelGrid" in data && typeof data.pixelGrid === "boolean") {
    prefs.pixelGrid = data.pixelGrid;
  }
  if ("compact" in data && COMPACT_MODES.includes(data.compact as CompactMode)) {
    prefs.compact = data.compact as CompactMode;
  }
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
  private data = $state<LayoutPrefsData>({
    hand: "right",
    toolsPosition: DEFAULT_TOOLS_POSITION,
    uiScale: 100,
    panelsOpen: true,
    pixelGrid: false,
    compact: "auto",
    sizes: {},
  });
  /** Changed before loading: kept over the saved values. */
  private changed: {
    hand?: true;
    toolsPosition?: true;
    uiScale?: true;
    panelsOpen?: true;
    pixelGrid?: true;
    compact?: true;
    sizes: string[];
  } = { sizes: [] };
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

  get toolsPosition(): number {
    return this.data.toolsPosition;
  }

  set toolsPosition(position: number) {
    const p = Math.min(1, Math.max(0, position));
    if (p === this.data.toolsPosition) return;
    this.data.toolsPosition = p;
    if (!this.loaded) this.changed.toolsPosition = true;
    this.scheduleSave();
  }

  /** The tool column back in the middle. */
  resetToolsPosition() {
    this.toolsPosition = DEFAULT_TOOLS_POSITION;
  }

  get uiScale(): number {
    return this.data.uiScale;
  }

  set uiScale(scale: number) {
    if (scale === this.data.uiScale) return;
    this.data.uiScale = scale;
    if (!this.loaded) this.changed.uiScale = true;
    this.scheduleSave();
  }

  get panelsOpen(): boolean {
    return this.data.panelsOpen;
  }

  set panelsOpen(open: boolean) {
    if (open === this.data.panelsOpen) return;
    this.data.panelsOpen = open;
    if (!this.loaded) this.changed.panelsOpen = true;
    this.scheduleSave();
  }

  get pixelGrid(): boolean {
    return this.data.pixelGrid;
  }

  set pixelGrid(shown: boolean) {
    if (shown === this.data.pixelGrid) return;
    this.data.pixelGrid = shown;
    if (!this.loaded) this.changed.pixelGrid = true;
    this.scheduleSave();
  }

  get compact(): CompactMode {
    return this.data.compact;
  }

  set compact(mode: CompactMode) {
    if (mode === this.data.compact) return;
    this.data.compact = mode;
    if (!this.loaded) this.changed.compact = true;
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
        if (saved.toolsPosition !== undefined && !this.changed.toolsPosition) {
          this.data.toolsPosition = saved.toolsPosition;
        }
        if (saved.uiScale !== undefined && !this.changed.uiScale) {
          this.data.uiScale = saved.uiScale;
        }
        if (saved.panelsOpen !== undefined && !this.changed.panelsOpen) {
          this.data.panelsOpen = saved.panelsOpen;
        }
        if (saved.pixelGrid !== undefined && !this.changed.pixelGrid) {
          this.data.pixelGrid = saved.pixelGrid;
        }
        if (saved.compact !== undefined && !this.changed.compact) {
          this.data.compact = saved.compact;
        }
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
      this.onError(m.app_layout_save_failed({ error: errorMessage(e) }));
    }
  }
}
