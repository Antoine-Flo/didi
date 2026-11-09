// Where the editor's parts go: the panels' column (its side, open or closed, in tabs or not),
// the compact layout, the thin columns against the edges, and the room left to the canvas.

import { untrack } from "svelte";
import {
  columnTops,
  edgeOnSide,
  nearestSide,
  positionOnEdge,
  sideOfEdge,
  type ColumnEdge,
} from "#lib/app/layout/edge-columns.js";
import type { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
import type { Insets } from "#lib/app/ui/canvas/CanvasView.svelte";
import type { PanelTab } from "#lib/app/ui/panels/PanelColumn.svelte";

const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 480;
/** Below this width or height (at 100% interface size), the window is small. */
const COMPACT_WIDTH = 900;
const COMPACT_HEIGHT = 600;
/** Below this height (at 100% interface size), the column has tabs. */
const TABS_HEIGHT = 560;

/** A saved panel size, as CSS. */
export const scaledSize = (size: number | undefined) =>
  size !== undefined ? `calc(${size}px * var(--ui-scale))` : undefined;

/** The elements the layout measures, bound by the editor. */
export interface LayoutElements {
  app?: HTMLElement;
  panelColumn?: HTMLElement;
  panelsTab?: HTMLElement;
  toolColumn?: HTMLElement;
  navColumn?: HTMLElement;
  /** Where the canvas starts below the title bar. */
  top?: HTMLElement;
  /** Where the canvas ends above the messages. */
  bottom?: HTMLElement;
  /** Where the thin columns can go, on either edge (see edge-columns.ts). */
  tracks: Record<ColumnEdge, HTMLElement | undefined>;
}

export class EditorLayout {
  /** The editor's size. */
  width = $state(0);
  height = $state(0);
  readonly elements: LayoutElements = $state({
    tracks: { panels: undefined, opposite: undefined },
  });

  /**
   * The screen takes fingers: the finger drawing option shows. Else (a PC, a graphics tablet)
   * it would only clutter the menu. Also once a finger touched it, if the browser did not say.
   */
  touchScreen = $state(navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches);
  /** The interface size as a factor. Saved panel sizes are at 100%: they follow it. */
  readonly uiScale: number;
  /** The panels' column: on the left for right-handed users, out of the drawing hand's way. */
  readonly panelsOnLeft: boolean;
  /** Set by the user, else undefined: the default width. */
  readonly panelWidth: number | undefined;

  // Compact: for a narrow or low window (a small tablet, a phone, landscape included), or
  // always or never, as chosen in the preferences. Only the tool's sliders stay in the title
  // bar, its other options go into its popup (see ToolButton); the menus are behind one
  // button, and there is neither the view's column nor the document's information: undo and
  // redo float in the bottom corner, below the tools, with the actions on the selection.
  //
  // The panels' column can be closed, to make room. When compact, it starts closed, and
  // opening it lasts until the layout is compact again; otherwise the user's choice is kept
  // from one session to the next.
  readonly compact: boolean;
  readonly panelsOpen: boolean;
  private openWhileCompact = $state(false);
  /** Opening or closing, animated: not while the column is resized. */
  private slidingNow = $state(false);
  private slideTimer: ReturnType<typeof setTimeout> | undefined;

  // The title bar holds the menus, then the tool's options. Short of room for the options,
  // the menus go behind one button first, until the window is as wide as the options needed;
  // another tool tries again.
  /** How many pixels the tool's options lack in the title bar. */
  toolbarLacking = $state(0);
  private menusShortNow = $state(false);
  private menusWidthNeeded = 0;

  // Short of height (or compact), the column shows one tab at a time: the color with the
  // palette, or the layers. When compact, two buttons open it on either tab, or close it.
  columnHeight = $state(0);
  readonly tabbed: boolean;
  panelTab = $state<PanelTab>("color");

  // The thin columns: the tools, and the view's buttons (not when compact), each against an
  // edge, pushed apart when on the same one (see edge-columns.ts).
  toolsHeight = $state(0);
  navHeight = $state(0);
  readonly trackHeights: Record<ColumnEdge, number> = $state({ panels: 0, opposite: 0 });
  /** The same on both edges: one button. */
  trackWidth = $state(0);
  /** The edge whose column is being dragged: above the rest. */
  draggedFrom = $state<ColumnEdge | null>(null);
  readonly navShown: boolean;
  readonly toolsEdge: ColumnEdge;
  readonly navEdge: ColumnEdge;
  /** Between two columns on the same edge: the gutter between panels. */
  readonly columnGap: number;
  readonly columnTop: { tools: number; nav: number };
  /** The height the tools have: their edge's, less the view's column if it is on it too. */
  readonly toolsRoom: number;

  /** Follows the preferences, and `toolId`: another tool tries the menus again. */
  constructor(
    private readonly prefs: LayoutPrefs,
    toolId: () => string,
  ) {
    this.uiScale = $derived(this.prefs.uiScale / 100);
    this.panelsOnLeft = $derived(this.prefs.hand === "right");
    this.panelWidth = $derived(this.prefs.size("panels"));
    const smallWindow = $derived(
      this.width > 0 &&
        (this.width < COMPACT_WIDTH * this.uiScale || this.height < COMPACT_HEIGHT * this.uiScale),
    );
    this.compact = $derived(
      this.prefs.compact === "auto" ? smallWindow : this.prefs.compact === "on",
    );
    this.panelsOpen = $derived(this.compact ? this.openWhileCompact : this.prefs.panelsOpen);
    this.tabbed = $derived(
      this.compact || (this.columnHeight > 0 && this.columnHeight < TABS_HEIGHT * this.uiScale),
    );
    this.navShown = $derived(!this.compact);
    this.toolsEdge = $derived(this.prefs.toolsEdge);
    this.navEdge = $derived(this.prefs.navEdge);
    this.columnGap = $derived(8 * this.uiScale);
    this.columnTop = $derived.by(() => this.placeColumns());
    this.toolsRoom = $derived(
      this.trackHeights[this.toolsEdge] -
        (this.navShown && this.navEdge === this.toolsEdge ? this.navHeight + this.columnGap : 0),
    );

    $effect(() => {
      if (this.touchScreen) {
        return;
      }
      const onPointer = (e: PointerEvent) => {
        if (e.pointerType === "touch") {
          this.touchScreen = true;
        }
      };
      window.addEventListener("pointerdown", onPointer, { capture: true });
      return () => window.removeEventListener("pointerdown", onPointer, { capture: true });
    });
    $effect(() => document.documentElement.style.setProperty("--ui-scale", String(this.uiScale)));
    $effect(() => {
      if (this.compact) {
        this.openWhileCompact = false;
      }
    });
    $effect(() => {
      void toolId();
      untrack(() => (this.menusShortNow = false));
    });
    $effect(() => {
      if (!this.menusShortNow && this.toolbarLacking > 0) {
        this.menusWidthNeeded = this.width + this.toolbarLacking;
        this.menusShortNow = true;
      } else if (this.menusShortNow && this.width >= this.menusWidthNeeded) {
        this.menusShortNow = false;
      }
    });
  }

  get sliding(): boolean {
    return this.slidingNow;
  }

  /** The menus are behind one button, to leave the tool's options room. */
  get menusShort(): boolean {
    return this.menusShortNow;
  }

  togglePanels() {
    if (this.compact) {
      this.openWhileCompact = !this.openWhileCompact;
    } else {
      this.prefs.panelsOpen = !this.prefs.panelsOpen;
    }
    this.slidingNow = true;
    clearTimeout(this.slideTimer);
    this.slideTimer = setTimeout(() => (this.slidingNow = false), 250);
  }

  /** Opens the column on a tab, or closes it if it shows that tab already. */
  openTab(tab: PanelTab) {
    if (this.panelsOpen && this.panelTab === tab) {
      return this.togglePanels();
    }
    this.panelTab = tab;
    if (!this.panelsOpen) {
      this.togglePanels();
    }
  }

  /** Popups of a column on an edge open towards the canvas. */
  popupSide(edge: ColumnEdge): "left" | "right" {
    return sideOfEdge(edge, this.panelsOnLeft) === "left" ? "right" : "left";
  }

  /** The panels' column's width now, and its bounds, for its splitter. */
  measurePanelWidth() {
    const { app, panelColumn } = this.elements;
    const size = panelColumn?.getBoundingClientRect().width ?? 0;
    // At most half the window, so the canvas keeps room.
    const min = MIN_PANEL_WIDTH * this.uiScale;
    const appWidth = app?.getBoundingClientRect().width ?? 0;
    const max = Math.min(MAX_PANEL_WIDTH * this.uiScale, appWidth / 2);
    return { size, min, max: Math.max(min, max) };
  }

  /** A column dropped at `box`: against the nearest side, at the height it was dropped. */
  dropColumn(column: "tools" | "nav", box: DOMRect) {
    const { app, tracks } = this.elements;
    if (!app) {
      return;
    }
    const edge = edgeOnSide(nearestSide(box, app.getBoundingClientRect()), this.panelsOnLeft);
    const track = tracks[edge];
    if (track) {
      this.prefs.placeColumn(column, edge, positionOnEdge(box, track.getBoundingClientRect()));
    }
  }

  /** Space taken by the floating panels over the canvas, margins included. */
  insets(): Insets {
    const { app, panelColumn, panelsTab, toolColumn, navColumn, top, bottom } = this.elements;
    if (!app || !top || !bottom) {
      return { left: 0, right: 0, top: 0, bottom: 0 };
    }
    const box = app.getBoundingClientRect();
    // On each side, as far as what floats there reaches: the panels' column and its tab, and
    // the thin columns.
    let left = 0;
    let right = 0;
    const floating = [
      this.panelsOpen ? panelColumn : undefined,
      panelsTab,
      toolColumn,
      this.navShown ? navColumn : undefined,
    ];
    for (const element of floating) {
      if (!element?.isConnected) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (nearestSide(rect, box) === "left") {
        left = Math.max(left, rect.right - box.left);
      } else {
        right = Math.max(right, box.right - rect.left);
      }
    }
    return {
      left,
      right,
      top: top.getBoundingClientRect().bottom - box.top,
      bottom: box.bottom - bottom.getBoundingClientRect().top,
    };
  }

  private placeColumns(): { tools: number; nav: number } {
    const tops = { tools: 0, nav: 0 };
    for (const edge of ["panels", "opposite"] as const) {
      const columns = [
        ...(this.toolsEdge === edge
          ? [{ id: "tools" as const, height: this.toolsHeight, position: this.prefs.toolsPosition }]
          : []),
        ...(this.navShown && this.navEdge === edge
          ? [{ id: "nav" as const, height: this.navHeight, position: this.prefs.navPosition }]
          : []),
      ];
      const placed = columnTops(this.trackHeights[edge], columns, this.columnGap);
      columns.forEach((c, i) => (tops[c.id] = placed[i]));
    }
    return tops;
  }
}
