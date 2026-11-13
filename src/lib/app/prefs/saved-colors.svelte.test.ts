// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolOptions } from "#lib/app/tools/tool.js";

const files = new Map<string, string>();
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => files.get(name) ?? null,
  writeDataFile: async (name: string, text: string) => void files.set(name, text),
}));

const { SavedColors, parseSavedColors } = await import("#lib/app/prefs/saved-colors.svelte.js");
const { SAVE_DELAY_MS } = await import("#lib/app/shared/data-file.js");

let stop = () => {};

function setup() {
  const options: ToolOptions = $state({ color: [0, 0, 0], secondary: [255, 255, 255], tools: {} });
  let colors!: InstanceType<typeof SavedColors>;
  stop = $effect.root(() => {
    colors = new SavedColors(options);
  });
  flushSync();
  return { options, colors };
}

beforeEach(() => {
  vi.useFakeTimers();
  files.clear();
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("SavedColors", () => {
  it("reads both colors, ignoring a file it does not understand", () => {
    expect(parseSavedColors('{"color":"#ff0000","secondary":null}')).toEqual({
      color: [255, 0, 0],
      secondary: null,
    });
    expect(parseSavedColors('{"color":"red","secondary":null}')).toBeNull();
    expect(parseSavedColors('{"version":1,"modes":{}}')).toBeNull();
    expect(parseSavedColors("null")).toBeNull();
  });

  it("takes the saved colors, then saves every change", async () => {
    files.set("colors.json", JSON.stringify({ version: 2, color: "#0000ff", secondary: null }));
    const { options, colors } = setup();
    await colors.load(() => {});
    expect(options.color).toEqual([0, 0, 255]);
    expect(options.secondary).toBeNull();
    options.color = [255, 0, 0];
    flushSync();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(JSON.parse(files.get("colors.json")!)).toEqual({
      version: 2,
      color: "#ff0000",
      secondary: null,
    });
  });

  it("saves nothing before loading: the saved colors are not overwritten", async () => {
    files.set("colors.json", JSON.stringify({ version: 2, color: "#0000ff", secondary: null }));
    const { options, colors } = setup();
    options.color = [255, 0, 0];
    flushSync();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await colors.load(() => {});
    expect(options.color).toEqual([0, 0, 255]);
  });
});
