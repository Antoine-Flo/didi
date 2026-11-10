import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const written: { name: string; text: string }[] = [];
const storage = { fail: false };
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => (name === "there.json" ? '{"a":1}' : null),
  writeDataFile: async (name: string, text: string) => {
    if (storage.fail) {
      throw new Error("disk full");
    }
    written.push({ name, text });
  },
}));

const { DataFile, SAVE_DELAY_MS } = await import("#lib/app/shared/data-file.js");

let value = 1;
const file = (name = "prefs.json") =>
  new DataFile(name, {
    content: () => ({ version: 1, value }),
    saveFailed: (error) => `could not save: ${error}`,
  });

beforeEach(() => {
  vi.useFakeTimers();
  written.length = 0;
  storage.fail = false;
  value = 1;
});
afterEach(() => vi.useRealTimers());

describe("DataFile", () => {
  it("reads the file's text, or null if there is none", async () => {
    expect(await file("there.json").load()).toBe('{"a":1}');
    expect(await file("missing.json").load()).toBeNull();
  });

  it("saves once, the delay after the last change, what there is then", async () => {
    const f = file();
    f.markLoaded();
    f.scheduleSave();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    f.scheduleSave();
    value = 2;
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(written).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(written).toEqual([
      { name: "prefs.json", text: JSON.stringify({ version: 1, value: 2 }, null, 2) + "\n" },
    ]);
  });

  it("does not save before the file is read, then saves", async () => {
    const f = file();
    expect(f.loaded).toBe(false);
    f.scheduleSave();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 5);
    expect(written).toEqual([]);
    f.markLoaded();
    expect(f.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(written).toHaveLength(1);
  });

  it("saves the waiting changes at once when flushed, and only those", async () => {
    const f = file();
    f.markLoaded();
    await f.flush();
    expect(written).toEqual([]);
    f.scheduleSave();
    await f.flush();
    expect(written).toHaveLength(1);
    // Not a second time when the delay ends.
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(written).toHaveLength(1);
    // Nor when flushed after the delay saved them.
    f.scheduleSave();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await f.flush();
    expect(written).toHaveLength(2);
  });

  it("shows a message when saving fails", async () => {
    const f = file();
    const errors: string[] = [];
    f.onError = (message) => errors.push(message);
    f.markLoaded();
    storage.fail = true;
    f.scheduleSave();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(errors).toEqual(["could not save: disk full"]);
  });
});
