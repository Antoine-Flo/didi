// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async () => null,
  writeDataFile: async () => {},
}));

const { EditorLayout } = await import("#lib/app/layout/editor-layout.svelte.js");
const { LayoutPrefs } = await import("#lib/app/prefs/layout-prefs.svelte.js");

type Layout = InstanceType<typeof EditorLayout>;
type Prefs = InstanceType<typeof LayoutPrefs>;

let stop = () => {};
/** The tool shown: another one tries the menus again. */
const tool = $state({ id: "brush" });

/** A layout in its own effect root, at a size. */
function setup(width = 1600, height = 1000): { layout: Layout; prefs: Prefs } {
  const prefs = new LayoutPrefs();
  let layout!: Layout;
  tool.id = "brush";
  stop = $effect.root(() => {
    layout = new EditorLayout(prefs, () => tool.id);
  });
  layout.width = width;
  layout.height = height;
  flushSync();
  return { layout, prefs };
}

/** An element at `rect`, in the page. */
function element(rect: { left: number; top: number; width: number; height: number }) {
  const div = document.createElement("div");
  document.body.append(div);
  const { left, top, width, height } = rect;
  div.getBoundingClientRect = () => new DOMRect(left, top, width, height);
  return div;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("compact layout", () => {
  it("is used below 900 × 600 at 100%, and never before the size is known", () => {
    const { layout } = setup(0, 0);
    expect(layout.compact).toBe(false);
    layout.width = 899;
    layout.height = 1000;
    expect(layout.compact).toBe(true);
    layout.width = 900;
    expect(layout.compact).toBe(false);
    layout.height = 599;
    expect(layout.compact).toBe(true);
  });

  it("follows the interface size", () => {
    const { layout, prefs } = setup(1200, 800);
    expect(layout.compact).toBe(false);
    prefs.uiScale = 150;
    flushSync();
    expect(layout.uiScale).toBe(1.5);
    // 1200 < 900 × 1.5.
    expect(layout.compact).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.5");
  });

  it("can be forced on or off", () => {
    const { layout, prefs } = setup(400, 400);
    prefs.compact = "off";
    expect(layout.compact).toBe(false);
    prefs.compact = "on";
    layout.width = 2000;
    layout.height = 2000;
    expect(layout.compact).toBe(true);
  });

  it("hides the view's column", () => {
    const { layout } = setup(400, 400);
    expect(layout.navShown).toBe(false);
  });
});

describe("the panels' column", () => {
  it("opens and closes with the preferences, out of the compact layout", () => {
    const { layout, prefs } = setup();
    expect(layout.panelsOpen).toBe(true);
    layout.togglePanels();
    expect(prefs.panelsOpen).toBe(false);
    expect(layout.panelsOpen).toBe(false);
  });

  it("starts closed when compact, and closes again when the layout becomes compact", () => {
    const { layout, prefs } = setup(400, 400);
    expect(layout.panelsOpen).toBe(false);
    layout.togglePanels();
    expect(layout.panelsOpen).toBe(true);
    // The user's choice out of the compact layout is not touched.
    expect(prefs.panelsOpen).toBe(true);
    layout.width = 1600;
    layout.height = 1000;
    flushSync();
    layout.width = 400;
    flushSync();
    expect(layout.panelsOpen).toBe(false);
  });

  it("slides for a moment after opening or closing", () => {
    vi.useFakeTimers();
    const { layout } = setup();
    layout.togglePanels();
    expect(layout.sliding).toBe(true);
    vi.advanceTimersByTime(249);
    expect(layout.sliding).toBe(true);
    vi.advanceTimersByTime(1);
    expect(layout.sliding).toBe(false);
  });

  it("is on the side away from the drawing hand", () => {
    const { layout, prefs } = setup();
    expect(layout.panelsOnLeft).toBe(true);
    expect(layout.popupSide("panels")).toBe("right");
    expect(layout.popupSide("opposite")).toBe("left");
    prefs.hand = "left";
    expect(layout.panelsOnLeft).toBe(false);
    expect(layout.popupSide("panels")).toBe("left");
  });

  it("has tabs when compact or short of height", () => {
    const { layout } = setup();
    expect(layout.tabbed).toBe(false);
    layout.columnHeight = 559;
    expect(layout.tabbed).toBe(true);
    layout.columnHeight = 560;
    expect(layout.tabbed).toBe(false);
    layout.width = 400;
    expect(layout.tabbed).toBe(true);
  });

  it("opens on a tab, switches tabs, and closes on the tab it shows", () => {
    const { layout } = setup(400, 400);
    layout.openTab("layers");
    expect(layout.panelsOpen).toBe(true);
    expect(layout.panelTab).toBe("layers");
    layout.openTab("color");
    expect(layout.panelsOpen).toBe(true);
    expect(layout.panelTab).toBe("color");
    layout.openTab("color");
    expect(layout.panelsOpen).toBe(false);
  });

  it("is between 180 and 480 pixels wide, and at most half the window", () => {
    const { layout } = setup();
    layout.elements.app = element({ left: 0, top: 0, width: 600, height: 800 });
    layout.elements.panelColumn = element({ left: 8, top: 40, width: 200, height: 700 });
    expect(layout.measurePanelWidth()).toEqual({ size: 200, min: 180, max: 300 });
    layout.elements.app = element({ left: 0, top: 0, width: 300, height: 800 });
    // Never below the minimum.
    expect(layout.measurePanelWidth().max).toBe(180);
  });
});

describe("the menus", () => {
  it("go behind one button when the tool's options lack room, until the window is wide enough", () => {
    const { layout } = setup(1000, 800);
    layout.toolbarLacking = 50;
    flushSync();
    expect(layout.menusShort).toBe(true);
    // With the menus folded, the options have room.
    layout.toolbarLacking = 0;
    layout.width = 1049;
    flushSync();
    expect(layout.menusShort).toBe(true);
    layout.width = 1050;
    flushSync();
    expect(layout.menusShort).toBe(false);
  });

  it("come back for another tool", () => {
    const { layout } = setup(1000, 800);
    layout.toolbarLacking = 50;
    flushSync();
    layout.toolbarLacking = 0;
    tool.id = "eraser";
    flushSync();
    expect(layout.menusShort).toBe(false);
  });
});

describe("the thin columns", () => {
  it("share an edge: the tools have its height less the view's column and a gap", () => {
    const { layout, prefs } = setup();
    layout.trackHeights.panels = 700;
    layout.trackHeights.opposite = 600;
    layout.navHeight = 100;
    expect(layout.toolsRoom).toBe(700);
    prefs.placeColumn("nav", "panels", 0);
    expect(layout.toolsRoom).toBe(700 - 100 - 8);
  });

  it("are dropped against the nearest side, at the height they were dropped", () => {
    const { layout, prefs } = setup();
    layout.elements.app = element({ left: 0, top: 0, width: 1600, height: 1000 });
    layout.elements.tracks.panels = element({ left: 220, top: 100, width: 40, height: 800 });
    layout.elements.tracks.opposite = element({ left: 1550, top: 40, width: 40, height: 900 });
    // Near the right side: the edge opposite the panels, which are on the left.
    layout.dropColumn("tools", new DOMRect(1500, 400, 40, 200));
    expect(prefs.toolsEdge).toBe("opposite");
    expect(prefs.toolsPosition).toBeGreaterThan(0);
    layout.dropColumn("tools", new DOMRect(100, 100, 40, 200));
    expect(prefs.toolsEdge).toBe("panels");
  });
});

describe("insets", () => {
  it("are as far as what floats on each side reaches, and the bars' heights", () => {
    const { layout } = setup();
    layout.elements.app = element({ left: 0, top: 0, width: 1600, height: 1000 });
    layout.elements.panelColumn = element({ left: 8, top: 40, width: 200, height: 950 });
    layout.elements.toolColumn = element({ left: 216, top: 100, width: 40, height: 300 });
    layout.elements.navColumn = element({ left: 1552, top: 40, width: 40, height: 200 });
    layout.elements.top = element({ left: 0, top: 36, width: 1600, height: 0 });
    layout.elements.bottom = element({ left: 0, top: 992, width: 1600, height: 0 });
    expect(layout.insets()).toEqual({ left: 256, right: 48, top: 36, bottom: 8 });
  });

  it("leave out the closed column and the hidden view's column", () => {
    const { layout } = setup();
    layout.elements.app = element({ left: 0, top: 0, width: 1600, height: 1000 });
    layout.elements.panelColumn = element({ left: 8, top: 40, width: 200, height: 950 });
    layout.elements.top = element({ left: 0, top: 0, width: 1600, height: 0 });
    layout.elements.bottom = element({ left: 0, top: 1000, width: 1600, height: 0 });
    layout.togglePanels();
    expect(layout.insets().left).toBe(0);
  });
});

describe("touch screens", () => {
  it("are known once a finger touches the screen", () => {
    const { layout } = setup();
    layout.touchScreen = false;
    flushSync();
    window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
    expect(layout.touchScreen).toBe(false);
    window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch" }));
    expect(layout.touchScreen).toBe(true);
  });
});
