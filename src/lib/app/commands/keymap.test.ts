import { describe, expect, it } from "vitest";
import { BROWSER_BINDINGS, DEFAULT_KEYMAP } from "./default-keymap";
import { chordOf, formatChord, KeymapIndex, normalizeChord, type KeyInput } from "./keymap";

const press = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("normalizeChord", () => {
  it("orders modifiers and lowercases", () => {
    expect(normalizeChord("Shift+Ctrl+Z")).toBe("ctrl+shift+z");
    expect(normalizeChord("alt+ctrl+shift+F2")).toBe("ctrl+alt+shift+f2");
    expect(normalizeChord("cmd+s")).toBe("ctrl+s");
  });

  it("names the plus key and arrows", () => {
    expect(normalizeChord("+")).toBe("plus");
    expect(normalizeChord("ctrl++")).toBe("ctrl+plus");
    expect(normalizeChord("ArrowLeft")).toBe("left");
    expect(normalizeChord("[")).toBe("[");
  });

  it("rejects invalid chords", () => {
    for (const chord of ["", "ctrl+", "hyper+a", "ctrl+shift", "a+b"]) {
      expect(() => normalizeChord(chord), chord).toThrow();
    }
  });
});

describe("chordOf", () => {
  it("includes modifiers for letters", () => {
    expect(chordOf(press("z", { ctrlKey: true }))).toBe("ctrl+z");
    expect(chordOf(press("Z", { ctrlKey: true, shiftKey: true }))).toBe("ctrl+shift+z");
    expect(chordOf(press("z", { metaKey: true }))).toBe("ctrl+z");
    expect(chordOf(press("b"))).toBe("b");
  });

  it("ignores Shift for symbols and digits (AZERTY digits need Shift)", () => {
    expect(chordOf(press("0", { shiftKey: true }))).toBe("0");
    expect(chordOf(press("+", { shiftKey: true }))).toBe("plus");
  });

  it("ignores AltGr for symbols, even when reported as Ctrl+Alt", () => {
    const altGr = { altGraph: true, ctrlKey: true, altKey: true };
    expect(chordOf(press("[", altGr))).toBe("[");
    expect(chordOf(press("[", { ctrlKey: true }))).toBe("ctrl+[");
  });

  it("returns null for modifier keys alone", () => {
    expect(chordOf(press("Control", { ctrlKey: true }))).toBeNull();
    expect(chordOf(press("Shift", { shiftKey: true }))).toBeNull();
    expect(chordOf(press("Dead"))).toBeNull();
  });

  it("keeps Shift for space and named keys", () => {
    expect(chordOf(press(" ", { shiftKey: true }))).toBe("shift+space");
    expect(chordOf(press("ArrowUp", { shiftKey: true }))).toBe("shift+up");
  });
});

describe("KeymapIndex", () => {
  it("matches key presses to bindings", () => {
    const index = new KeymapIndex({
      version: 1,
      bindings: [
        { keys: "ctrl+z", command: "history.undo" },
        { keys: "Ctrl+Shift+Z", command: "history.redo" },
        { keys: "t", command: "tool.select", params: { tool: "brush" } },
      ],
    });
    expect(index.match(press("z", { ctrlKey: true }))?.command).toBe("history.undo");
    expect(index.match(press("Z", { ctrlKey: true, shiftKey: true }))?.command).toBe(
      "history.redo",
    );
    expect(index.match(press("t"))?.params).toEqual({ tool: "brush" });
    expect(index.match(press("z"))).toBeUndefined();
  });

  it("lets later bindings replace earlier ones", () => {
    const index = new KeymapIndex({
      version: 1,
      bindings: [
        { keys: "b", command: "a.one" },
        { keys: "B", command: "a.two" },
      ],
    });
    expect(index.match(press("b"))?.command).toBe("a.two");
    expect(index.chordsFor("a.one")).toEqual([]);
  });

  it("lists the chords of a command", () => {
    const index = new KeymapIndex(DEFAULT_KEYMAP);
    expect(index.chordsFor("history.redo")).toEqual(["ctrl+shift+z", "ctrl+y"]);
    expect(index.chordsFor("view.zoomIn")).toEqual(["plus", "="]);
  });

  it("lists each command once with its chords, the overridden ones dropped", () => {
    const index = new KeymapIndex({
      version: 1,
      bindings: [
        { keys: "b", command: "tool.brush" },
        { keys: "ctrl+z", command: "history.undo" },
        { keys: "ctrl+y", command: "history.redo" },
        { keys: "ctrl+shift+z", command: "history.redo" },
        { keys: "b", command: "tool.pixel" },
      ],
    });
    expect(index.shortcuts()).toEqual([
      { command: "tool.pixel", chords: ["b"] },
      { command: "history.undo", chords: ["ctrl+z"] },
      { command: "history.redo", chords: ["ctrl+y", "ctrl+shift+z"] },
    ]);
  });

  it("has a valid default keymap without duplicate chords", () => {
    const chords = DEFAULT_KEYMAP.bindings.map((b) => normalizeChord(b.keys));
    expect(new Set(chords).size).toBe(chords.length);
  });
});

describe("formatChord", () => {
  it("shows chords to the user", () => {
    expect(formatChord("ctrl+shift+z")).toBe("Ctrl+Shift+Z");
    expect(formatChord("plus")).toBe("+");
    expect(formatChord("f2")).toBe("F2");
    expect(formatChord("[")).toBe("[");
  });
});

describe("browser shortcuts", () => {
  it("make Ctrl+S export", () => {
    const keymap = new KeymapIndex({
      version: 1,
      bindings: [...DEFAULT_KEYMAP.bindings, ...BROWSER_BINDINGS],
    });
    expect(keymap.match(press("s", { ctrlKey: true }))?.command).toBe("file.exportPng");
  });
});
