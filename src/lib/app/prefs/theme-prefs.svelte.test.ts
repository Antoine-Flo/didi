// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => files.get(name) ?? null,
  writeDataFile: async (name: string, text: string) => void files.set(name, text),
}));

const { ThemePrefs } = await import("#lib/app/prefs/theme-prefs.svelte.js");
const { SAVE_DELAY_MS } = await import("#lib/app/shared/data-file.js");

beforeEach(() => {
  vi.useFakeTimers();
  files.clear();
  files.set("theme.json", JSON.stringify({ version: 1, mode: "light", tint: false }));
});
afterEach(() => vi.useRealTimers());

describe("ThemePrefs", () => {
  it("takes the saved choices, and saves the changes", async () => {
    const prefs = new ThemePrefs();
    await prefs.load();
    expect(prefs.choice).toMatchObject({ mode: "light", tint: false });
    prefs.set("canvas", "#123456");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(JSON.parse(files.get("theme.json")!)).toMatchObject({
      version: 1,
      mode: "light",
      canvas: "#123456",
    });
  });

  it("keeps the choices made before loading, and saves them once loaded", async () => {
    const prefs = new ThemePrefs();
    prefs.set("canvas", "#abcdef");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(JSON.parse(files.get("theme.json")!).canvas).toBeUndefined();
    await prefs.load();
    // A change before loading keeps all the choices as they are.
    expect(prefs.choice).toMatchObject({ mode: "dark", canvas: "#abcdef" });
    await prefs.flush();
    expect(JSON.parse(files.get("theme.json")!)).toMatchObject({ mode: "dark", canvas: "#abcdef" });
  });
});
