// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => files.get(name) ?? null,
  writeDataFile: async (name: string, text: string) => void files.set(name, text),
}));

const { LayoutPrefs } = await import("#lib/app/prefs/layout-prefs.svelte.js");
const { SAVE_DELAY_MS } = await import("#lib/app/shared/data-file.js");

const PANEL = { selector: "square", shades: true, recent: true } as const;

beforeEach(() => {
  vi.useFakeTimers();
  files.clear();
  files.set(
    "layout.json",
    JSON.stringify({
      version: 1,
      hand: "left",
      uiScale: 150,
      navEdge: "panels",
      navPosition: 0.5,
      penSeen: true,
      sizes: { palette: 200, layers: 300 },
      colorPanels: { pixel: { shades: false }, painting: { recent: false } },
    }),
  );
});
afterEach(() => vi.useRealTimers());

const saved = () => JSON.parse(files.get("layout.json")!);

describe("LayoutPrefs", () => {
  it("takes the saved preferences", async () => {
    const prefs = new LayoutPrefs();
    await prefs.load(() => {});
    expect(prefs.hand).toBe("left");
    expect(prefs.uiScale).toBe(150);
    expect([prefs.navEdge, prefs.navPosition]).toEqual(["panels", 0.5]);
    expect(prefs.penSeen).toBe(true);
    expect(prefs.size("palette")).toBe(200);
    expect(prefs.colorPanel("pixel", PANEL).shades).toBe(false);
    // The others keep their defaults.
    expect(prefs.compact).toBe("auto");
    expect(prefs.panelsOpen).toBe(true);
  });

  it("keeps what changed before loading over the saved values", async () => {
    const prefs = new LayoutPrefs();
    prefs.uiScale = 200;
    prefs.placeColumn("nav", "opposite", 0.25);
    prefs.setSize("palette", 120);
    prefs.setColorPanel("pixel", { shades: true });
    await prefs.load(() => {});
    expect(prefs.uiScale).toBe(200);
    expect([prefs.navEdge, prefs.navPosition]).toEqual(["opposite", 0.25]);
    expect(prefs.size("palette")).toBe(120);
    expect(prefs.colorPanel("pixel", PANEL).shades).toBe(true);
    // What did not change is still read.
    expect(prefs.hand).toBe("left");
    expect(prefs.size("layers")).toBe(300);
    expect(prefs.colorPanel("painting", PANEL).recent).toBe(false);
  });

  it("saves after a change, only once loaded", async () => {
    const prefs = new LayoutPrefs();
    prefs.compact = "on";
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(saved().compact).toBeUndefined();
    await prefs.load(() => {});
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saved()).toMatchObject({ version: 1, compact: "on", hand: "left", uiScale: 150 });
  });

  it("does not save a value that did not change", async () => {
    const prefs = new LayoutPrefs();
    await prefs.load(() => {});
    files.clear();
    prefs.hand = "left";
    prefs.notePen();
    prefs.resetSize("unknown");
    prefs.placeColumn("nav", "panels", 0.5);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(files.size).toBe(0);
    prefs.resetSize("palette");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saved().sizes).toEqual({ layers: 300 });
  });

  it("saves at once when flushed", async () => {
    const prefs = new LayoutPrefs();
    await prefs.load(() => {});
    prefs.uiScale = 125;
    await prefs.flush();
    expect(saved().uiScale).toBe(125);
  });
});
