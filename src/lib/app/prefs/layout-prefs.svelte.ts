// The user's layout preferences, saved in the app data folder so they are kept from one
// session to the next: the hand (the panels on the left for right-handed users, on the
// right for left-handed ones), the edge each thin column (the tools, the view's buttons)
// stands against and its place along it (see edge-columns.ts), the interface size, and
// whether the layout is compact, whether the panels' column is open (on a wide window; see
// EditorApp), whether one finger draws on a touch screen (see touch-gestures.ts), the sizes of
// resizable panels, in pixels at 100% interface size, by panel id (e.g.
// "palette"; a panel without a size has its default one, see the Splitter widget). The
// same in every mode: switching modes moves nothing. Except what the color panel shows
// (selector, shades, recent colors): each mode has its own, from its defaults (see Mode).

import { errorMessage } from "#lib/app/shared/error-message.js";
import type { ColumnEdge } from "#lib/app/layout/edge-columns.js";
import {
  parseLayoutPrefs,
  type ColorPanelPrefs,
  type CompactMode,
  type FingerDrawing,
  type Hand,
  type LayoutPrefsData,
} from "#lib/app/prefs/layout-prefs.js";
import { readDataFile, writeDataFile } from "#lib/platform/storage.js";
import { m } from "#lib/paraglide/messages.js";

const FILE = "layout.json";
const VERSION = 1;
const SAVE_DELAY_MS = 300;

export class LayoutPrefs {
  private data = $state<LayoutPrefsData>({
    hand: "right",
    toolsEdge: "panels",
    toolsPosition: 0,
    navEdge: "opposite",
    navPosition: 0,
    uiScale: 100,
    panelsOpen: true,
    pixelGrid: false,
    compact: "auto",
    fingerDrawing: "auto",
    penSeen: false,
    colorPanels: {},
    sizes: {},
  });
  /** Changed before loading: kept over the saved values. */
  private changed: {
    hand?: true;
    toolsEdge?: true;
    toolsPosition?: true;
    navEdge?: true;
    navPosition?: true;
    uiScale?: true;
    panelsOpen?: true;
    pixelGrid?: true;
    compact?: true;
    fingerDrawing?: true;
    penSeen?: true;
    sizes: string[];
    /** Modes whose color panel changed. */
    colorPanels: string[];
  } = { sizes: [], colorPanels: [] };
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onError: (message: string) => void = () => {};

  get hand(): Hand {
    return this.data.hand;
  }

  set hand(hand: Hand) {
    if (hand === this.data.hand) {
      return;
    }
    this.data.hand = hand;
    if (!this.loaded) {
      this.changed.hand = true;
    }
    this.scheduleSave();
  }

  get toolsEdge(): ColumnEdge {
    return this.data.toolsEdge;
  }

  get toolsPosition(): number {
    return this.data.toolsPosition;
  }

  get navEdge(): ColumnEdge {
    return this.data.navEdge;
  }

  get navPosition(): number {
    return this.data.navPosition;
  }

  /** Puts a thin column against an edge, at a place along it (clamped from 0 to 1). */
  placeColumn(column: "tools" | "nav", edge: ColumnEdge, position: number) {
    const p = Math.min(1, Math.max(0, position));
    const [edgeKey, positionKey] =
      column === "tools"
        ? (["toolsEdge", "toolsPosition"] as const)
        : (["navEdge", "navPosition"] as const);
    if (edge === this.data[edgeKey] && p === this.data[positionKey]) {
      return;
    }
    this.data[edgeKey] = edge;
    this.data[positionKey] = p;
    if (!this.loaded) {
      this.changed[edgeKey] = true;
      this.changed[positionKey] = true;
    }
    this.scheduleSave();
  }

  /** A thin column back where it starts: at the top of its edge (the tools beside the panels). */
  resetColumn(column: "tools" | "nav") {
    this.placeColumn(column, column === "tools" ? "panels" : "opposite", 0);
  }

  get uiScale(): number {
    return this.data.uiScale;
  }

  set uiScale(scale: number) {
    if (scale === this.data.uiScale) {
      return;
    }
    this.data.uiScale = scale;
    if (!this.loaded) {
      this.changed.uiScale = true;
    }
    this.scheduleSave();
  }

  get panelsOpen(): boolean {
    return this.data.panelsOpen;
  }

  set panelsOpen(open: boolean) {
    if (open === this.data.panelsOpen) {
      return;
    }
    this.data.panelsOpen = open;
    if (!this.loaded) {
      this.changed.panelsOpen = true;
    }
    this.scheduleSave();
  }

  get pixelGrid(): boolean {
    return this.data.pixelGrid;
  }

  set pixelGrid(shown: boolean) {
    if (shown === this.data.pixelGrid) {
      return;
    }
    this.data.pixelGrid = shown;
    if (!this.loaded) {
      this.changed.pixelGrid = true;
    }
    this.scheduleSave();
  }

  get compact(): CompactMode {
    return this.data.compact;
  }

  set compact(mode: CompactMode) {
    if (mode === this.data.compact) {
      return;
    }
    this.data.compact = mode;
    if (!this.loaded) {
      this.changed.compact = true;
    }
    this.scheduleSave();
  }

  get fingerDrawing(): FingerDrawing {
    return this.data.fingerDrawing;
  }

  set fingerDrawing(mode: FingerDrawing) {
    if (mode === this.data.fingerDrawing) {
      return;
    }
    this.data.fingerDrawing = mode;
    if (!this.loaded) {
      this.changed.fingerDrawing = true;
    }
    this.scheduleSave();
  }

  get penSeen(): boolean {
    return this.data.penSeen;
  }

  /** A pen was used: kept for good. */
  notePen() {
    if (this.data.penSeen) {
      return;
    }
    this.data.penSeen = true;
    if (!this.loaded) {
      this.changed.penSeen = true;
    }
    this.scheduleSave();
  }

  /** One finger draws, from the setting and whether a pen was used. */
  get fingerDraws(): boolean {
    const mode = this.data.fingerDrawing;
    return mode === "on" || (mode === "auto" && !this.data.penSeen);
  }

  /** What the color panel shows in a mode: the user's choices over the mode's defaults. */
  colorPanel(mode: string, defaults: ColorPanelPrefs): ColorPanelPrefs {
    return { ...defaults, ...this.data.colorPanels[mode] };
  }

  setColorPanel(mode: string, change: Partial<ColorPanelPrefs>) {
    this.data.colorPanels[mode] = { ...this.data.colorPanels[mode], ...change };
    if (!this.loaded) {
      this.changed.colorPanels.push(mode);
    }
    this.scheduleSave();
  }

  /** The size of a panel, or undefined for its default size. */
  size(id: string): number | undefined {
    return this.data.sizes[id];
  }

  setSize(id: string, size: number) {
    this.data.sizes[id] = Math.round(size);
    if (!this.loaded) {
      this.changed.sizes.push(id);
    }
    this.scheduleSave();
  }

  /** Back to the default size. */
  resetSize(id: string) {
    if (!(id in this.data.sizes)) {
      return;
    }
    delete this.data.sizes[id];
    if (!this.loaded) {
      this.changed.sizes.push(id);
    }
    this.scheduleSave();
  }

  /** Reads the saved preferences. Those changed before keep their value. */
  async load(onError: (message: string) => void): Promise<void> {
    this.onError = onError;
    try {
      const text = await readDataFile(FILE);
      if (text !== null) {
        const saved = parseLayoutPrefs(text);
        if (saved.hand && !this.changed.hand) {
          this.data.hand = saved.hand;
        }
        if (saved.toolsPosition !== undefined && !this.changed.toolsPosition) {
          this.data.toolsPosition = saved.toolsPosition;
        }
        if (saved.toolsEdge !== undefined && !this.changed.toolsEdge) {
          this.data.toolsEdge = saved.toolsEdge;
        }
        if (saved.navEdge !== undefined && !this.changed.navEdge) {
          this.data.navEdge = saved.navEdge;
        }
        if (saved.navPosition !== undefined && !this.changed.navPosition) {
          this.data.navPosition = saved.navPosition;
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
        if (saved.fingerDrawing !== undefined && !this.changed.fingerDrawing) {
          this.data.fingerDrawing = saved.fingerDrawing;
        }
        if (saved.penSeen !== undefined && !this.changed.penSeen) {
          this.data.penSeen = saved.penSeen;
        }
        for (const [mode, panel] of Object.entries(saved.colorPanels ?? {})) {
          if (!this.changed.colorPanels.includes(mode)) {
            this.data.colorPanels[mode] = panel;
          }
        }
        for (const [id, size] of Object.entries(saved.sizes ?? {})) {
          if (!this.changed.sizes.includes(id)) {
            this.data.sizes[id] = size;
          }
        }
      }
    } catch {
      // An unreadable file only loses the preferences: start from the defaults.
    }
    this.loaded = true;
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  async flush(): Promise<void> {
    if (this.timer === null) {
      return;
    }
    clearTimeout(this.timer);
    await this.save();
  }

  private scheduleSave() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  private async save() {
    this.timer = null;
    // Before loading, saving would overwrite the file with the defaults: try again later.
    if (!this.loaded) {
      return this.scheduleSave();
    }
    const text = JSON.stringify({ version: VERSION, ...this.data }, null, 2) + "\n";
    try {
      await writeDataFile(FILE, text);
    } catch (e) {
      this.onError(m.app_layout_save_failed({ error: errorMessage(e) }));
    }
  }
}
