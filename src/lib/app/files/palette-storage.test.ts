import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => files.get(name) ?? null,
  writeDataFile: async (name: string, text: string) => void files.set(name, text),
}));

const { flushPalettes, loadPalettes } = await import("#lib/app/files/palette-storage.js");
const { SAVE_DELAY_MS } = await import("#lib/app/shared/data-file.js");

beforeEach(() => {
  vi.useFakeTimers();
  files.clear();
});
afterEach(() => vi.useRealTimers());

const savedNames = () =>
  (JSON.parse(files.get("palettes.json")!).palettes as { name: string }[]).map((p) => p.name);

describe("palette storage", () => {
  it("saves the library after a change, and at once when flushed", async () => {
    const library = await loadPalettes(() => {});
    expect(files.has("palettes.json")).toBe(false);
    library.add({ name: "Mine", colors: [[1, 2, 3]] });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(savedNames()).toContain("Mine");
    library.add({ name: "Other", colors: [] });
    await flushPalettes();
    expect(savedNames()).toContain("Other");
  });

  it("keeps an unreadable file aside, and says so", async () => {
    files.set("palettes.json", "not json");
    const errors: string[] = [];
    await loadPalettes((message) => errors.push(message));
    expect(files.get("palettes-unreadable.json")).toBe("not json");
    expect(errors).toHaveLength(1);
  });
});
