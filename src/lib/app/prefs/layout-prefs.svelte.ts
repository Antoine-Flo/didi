// The user's layout preferences, saved in the app data folder so they are kept from one
// session to the next: the hand (the panels on the left for right-handed users, on the
// right for left-handed ones), the edge each thin column (the tools, the view's buttons)
// stands against and its place along it (see edge-columns.ts), the interface size, and
// whether the layout is compact, whether the panels' column is open (on a wide window; see
// EditorApp), whether one finger draws on a touch screen (see touch-gestures.ts), the sizes of
// resizable panels, in pixels at 100% interface size, by panel id (e.g.
// "palette"; a panel without a size has its default one, see the Splitter widget), and the
// color panel's selector.

import { DataFile } from "#lib/app/shared/data-file.js";
import type { ColumnEdge } from "#lib/app/layout/edge-columns.js";
import {
  parseLayoutPrefs,
  type ColorSelector,
  type CompactMode,
  type FingerDrawing,
  type Hand,
  type LayoutPrefsData,
} from "#lib/app/prefs/layout-prefs.js";
import { m } from "#lib/paraglide/messages.js";

const VERSION = 1;

/** The preferences holding one value, as opposed to one per panel. */
type Field = Exclude<keyof LayoutPrefsData, "sizes">;
const FIELDS: readonly Field[] = [
  "hand",
  "toolsEdge",
  "toolsPosition",
  "navEdge",
  "navPosition",
  "uiScale",
  "panelsOpen",
  "pixelGrid",
  "compact",
  "fingerDrawing",
  "penSeen",
  "colorSelector",
];

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
    colorSelector: "square",
    sizes: {},
  });
  /** Changed before loading: kept over the saved values. */
  private changed = {
    fields: {} as Partial<Record<Field, true>>,
    sizes: [] as string[],
  };
  private readonly file = new DataFile("layout.json", {
    content: () => ({ version: VERSION, ...this.data }),
    saveFailed: (error) => m.app_layout_save_failed({ error }),
  });

  get hand(): Hand {
    return this.data.hand;
  }

  set hand(hand: Hand) {
    this.setField("hand", hand);
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
    this.changedFields(edgeKey, positionKey);
  }

  /** A thin column back where it starts: at the top of its edge (the tools beside the panels). */
  resetColumn(column: "tools" | "nav") {
    this.placeColumn(column, column === "tools" ? "panels" : "opposite", 0);
  }

  get uiScale(): number {
    return this.data.uiScale;
  }

  set uiScale(scale: number) {
    this.setField("uiScale", scale);
  }

  get panelsOpen(): boolean {
    return this.data.panelsOpen;
  }

  set panelsOpen(open: boolean) {
    this.setField("panelsOpen", open);
  }

  get pixelGrid(): boolean {
    return this.data.pixelGrid;
  }

  set pixelGrid(shown: boolean) {
    this.setField("pixelGrid", shown);
  }

  get compact(): CompactMode {
    return this.data.compact;
  }

  set compact(mode: CompactMode) {
    this.setField("compact", mode);
  }

  get fingerDrawing(): FingerDrawing {
    return this.data.fingerDrawing;
  }

  set fingerDrawing(mode: FingerDrawing) {
    this.setField("fingerDrawing", mode);
  }

  get penSeen(): boolean {
    return this.data.penSeen;
  }

  /** A pen was used: kept for good. */
  notePen() {
    this.setField("penSeen", true);
  }

  /** One finger draws, from the setting and whether a pen was used. */
  get fingerDraws(): boolean {
    const mode = this.data.fingerDrawing;
    return mode === "on" || (mode === "auto" && !this.data.penSeen);
  }

  get colorSelector(): ColorSelector {
    return this.data.colorSelector;
  }

  set colorSelector(selector: ColorSelector) {
    this.setField("colorSelector", selector);
  }

  /** The size of a panel, or undefined for its default size. */
  size(id: string): number | undefined {
    return this.data.sizes[id];
  }

  setSize(id: string, size: number) {
    this.data.sizes[id] = Math.round(size);
    this.changedIn(this.changed.sizes, id);
  }

  /** Back to the default size. */
  resetSize(id: string) {
    if (!(id in this.data.sizes)) {
      return;
    }
    delete this.data.sizes[id];
    this.changedIn(this.changed.sizes, id);
  }

  /** Reads the saved preferences. Those changed before keep their value. */
  async load(onError: (message: string) => void): Promise<void> {
    this.file.onError = onError;
    try {
      const text = await this.file.load();
      if (text !== null) {
        const saved = parseLayoutPrefs(text);
        for (const field of FIELDS) {
          if (saved[field] !== undefined && !this.changed.fields[field]) {
            this.take(field, saved[field]);
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
    this.file.markLoaded();
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  flush(): Promise<void> {
    return this.file.flush();
  }

  private take<K extends Field>(field: K, value: LayoutPrefsData[K]) {
    this.data[field] = value;
  }

  private setField<K extends Field>(field: K, value: LayoutPrefsData[K]) {
    if (value === this.data[field]) {
      return;
    }
    this.take(field, value);
    this.changedFields(field);
  }

  private changedFields(...fields: Field[]) {
    if (!this.file.loaded) {
      for (const field of fields) {
        this.changed.fields[field] = true;
      }
    }
    this.file.scheduleSave();
  }

  private changedIn(list: string[], key: string) {
    if (!this.file.loaded) {
      list.push(key);
    }
    this.file.scheduleSave();
  }
}
