// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RGB } from "#lib/core/color/color.js";

const files = new Map<string, string>();
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => files.get(name) ?? null,
  writeDataFile: async (name: string, text: string) => void files.set(name, text),
}));

const { ModeColors } = await import("#lib/app/prefs/mode-colors.svelte.js");
const { SAVE_DELAY_MS } = await import("#lib/app/shared/data-file.js");

const RED: RGB = [255, 0, 0];
const BLUE: RGB = [0, 0, 255];

beforeEach(() => {
  vi.useFakeTimers();
  files.clear();
  files.set(
    "colors.json",
    JSON.stringify({
      version: 1,
      modes: { pixel: { color: "#0000ff", secondary: null, recent: ["#0000ff"] } },
    }),
  );
});
afterEach(() => vi.useRealTimers());

const saved = () => JSON.parse(files.get("colors.json")!);

describe("ModeColors", () => {
  it("ignores the current colors set before loading, and keeps the recent ones first", async () => {
    const colors = new ModeColors();
    colors.setCurrent("pixel", RED, RED);
    colors.setCurrent("painting", RED, RED);
    colors.addRecent("pixel", RED);
    await colors.load(() => {});
    expect(colors.current("pixel")).toEqual({ color: BLUE, secondary: null });
    expect(colors.current("painting")).toBeNull();
    expect(colors.recent("pixel")).toEqual([RED, BLUE]);
  });

  it("saves the colors after a change, as hex", async () => {
    const colors = new ModeColors();
    await colors.load(() => {});
    colors.setCurrent("painting", RED, null);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saved()).toEqual({
      version: 1,
      modes: {
        pixel: { color: "#0000ff", secondary: null, recent: ["#0000ff"] },
        painting: { color: "#ff0000", secondary: null, recent: [] },
      },
    });
  });

  it("saves at once when flushed", async () => {
    const colors = new ModeColors();
    await colors.load(() => {});
    colors.clearRecent("pixel");
    await colors.flush();
    expect(saved().modes.pixel.recent).toEqual([]);
  });
});
