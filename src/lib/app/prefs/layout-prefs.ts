// The layout preferences' types and the parsing of their saved file, kept apart from
// LayoutPrefs (see layout-prefs.svelte.ts): pure, without runes.

import type { ColumnEdge } from "#lib/app/layout/edge-columns.js";

export type Hand = "right" | "left";
/** The compact layout: on a small window ("auto"), always, or never. */
export type CompactMode = "auto" | "on" | "off";
const COMPACT_MODES: readonly CompactMode[] = ["auto", "on", "off"];
/** One finger draws: until a pen is used ("auto"), always, or never (it moves the view). */
export type FingerDrawing = "auto" | "on" | "off";
const FINGER_DRAWINGS: readonly FingerDrawing[] = ["auto", "on", "off"];
/**
 * The color panel's selector: a square with a hue bar, or a hue ring around a square
 * ("wheel") or around a triangle.
 */
export type ColorSelector = "square" | "wheel" | "triangle";
export const COLOR_SELECTORS: readonly ColorSelector[] = ["square", "wheel", "triangle"];
/** What the color panel shows. */
export interface ColorPanelPrefs {
  selector: ColorSelector;
  /** The shade bars, below the selector. */
  shades: boolean;
  /** The recent colors, at the bottom. */
  recent: boolean;
}

/** A saved color panel's preferences, keeping only what is valid. */
function parseColorPanel(data: unknown): Partial<ColorPanelPrefs> {
  const prefs: Partial<ColorPanelPrefs> = {};
  if (typeof data !== "object" || data === null) {
    return prefs;
  }
  if ("selector" in data && COLOR_SELECTORS.includes(data.selector as ColorSelector)) {
    prefs.selector = data.selector as ColorSelector;
  }
  if ("shades" in data && typeof data.shades === "boolean") {
    prefs.shades = data.shades;
  }
  if ("recent" in data && typeof data.recent === "boolean") {
    prefs.recent = data.recent;
  }
  return prefs;
}

/** The interface size, in percent. Barely below 100: the interface is already compact. */
export const UI_SCALE_MIN = 90;
export const UI_SCALE_MAX = 150;
export const UI_SCALE_STEP = 5;

export interface LayoutPrefsData {
  hand: Hand;
  /** The tool column's edge, and its place along it: 0 at the top, 1 at the bottom. */
  toolsEdge: ColumnEdge;
  toolsPosition: number;
  /** The view's column's edge, and its place along it. */
  navEdge: ColumnEdge;
  navPosition: number;
  /** The interface size, in percent. */
  uiScale: number;
  /** The panels' column is shown. */
  panelsOpen: boolean;
  /** The pixels' grid shows when zoomed in. */
  pixelGrid: boolean;
  compact: CompactMode;
  fingerDrawing: FingerDrawing;
  /** A pen was used on this device: with "auto", one finger then moves the view. */
  penSeen: boolean;
  /** What the color panel shows, by mode id: only what the user changed. */
  colorPanels: Record<string, Partial<ColorPanelPrefs>>;
  sizes: Record<string, number>;
}

const EDGES: readonly ColumnEdge[] = ["panels", "opposite"];

/** The preferences in a saved file. Anything unexpected is ignored: they are not precious. */
export function parseLayoutPrefs(text: string): Partial<LayoutPrefsData> {
  const prefs: Partial<LayoutPrefsData> = {};
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) {
    return prefs;
  }
  if ("hand" in data && (data.hand === "right" || data.hand === "left")) {
    prefs.hand = data.hand;
  }
  if ("toolsPosition" in data) {
    const p = data.toolsPosition;
    if (typeof p === "number" && p >= 0 && p <= 1) {
      prefs.toolsPosition = p;
    }
  }
  if ("toolsEdge" in data && EDGES.includes(data.toolsEdge as ColumnEdge)) {
    prefs.toolsEdge = data.toolsEdge as ColumnEdge;
  }
  if ("navEdge" in data && EDGES.includes(data.navEdge as ColumnEdge)) {
    prefs.navEdge = data.navEdge as ColumnEdge;
  }
  if ("navPosition" in data) {
    const p = data.navPosition;
    if (typeof p === "number" && p >= 0 && p <= 1) {
      prefs.navPosition = p;
    }
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
  if ("fingerDrawing" in data && FINGER_DRAWINGS.includes(data.fingerDrawing as FingerDrawing)) {
    prefs.fingerDrawing = data.fingerDrawing as FingerDrawing;
  }
  if ("penSeen" in data && typeof data.penSeen === "boolean") {
    prefs.penSeen = data.penSeen;
  }
  if ("colorPanels" in data && typeof data.colorPanels === "object" && data.colorPanels !== null) {
    const panels: Record<string, Partial<ColorPanelPrefs>> = {};
    for (const [mode, panel] of Object.entries(data.colorPanels)) {
      panels[mode] = parseColorPanel(panel);
    }
    prefs.colorPanels = panels;
  }
  if ("sizes" in data && typeof data.sizes === "object" && data.sizes !== null) {
    const sizes: Record<string, number> = {};
    for (const [id, size] of Object.entries(data.sizes)) {
      if (typeof size === "number" && Number.isFinite(size) && size > 0) {
        sizes[id] = size;
      }
    }
    prefs.sizes = sizes;
  }
  return prefs;
}
