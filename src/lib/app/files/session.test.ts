import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentFromEditor, readDidi, writeDidi } from "#lib/core/file/didi-file.js";
import { newEditor } from "#lib/app/files/new-drawing.js";
import type { UnsavedChoice } from "#lib/app/files/session.svelte.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

// Files and app data in memory, and the worker's work done directly.
const disk = new Map<string, Uint8Array>();
const data = new Map<string, Uint8Array | string>();
const dialogs = { open: null as string | null, save: null as string | null };
const browser = { active: false, cancel: false, written: [] as string[] };
const writeFails = { active: false };

vi.mock("#lib/platform/storage.js", () => ({
  canUseFiles: () => !browser.active,
  chooseBrowserFile: async (name: string) =>
    browser.cancel ? null : async () => void browser.written.push(name),
  readFile: async (path: string) => {
    const bytes = disk.get(path);
    if (!bytes) {
      throw new Error("No such file");
    }
    return bytes.slice();
  },
  writeFile: async (path: string, bytes: Uint8Array) => void disk.set(path, bytes.slice()),
  chooseFileToOpen: async () => dialogs.open,
  chooseFileToSave: async () => dialogs.save,
  readDataFile: async (name: string) => (data.get(name) as string | undefined) ?? null,
  writeDataFile: async (name: string, text: string) => void data.set(name, text),
  readDataBytes: async (name: string) => (data.get(name) as Uint8Array | undefined) ?? null,
  writeDataBytes: async (name: string, bytes: Uint8Array) => {
    if (writeFails.active) {
      throw new Error("Disk full");
    }
    data.set(name, bytes);
  },
  removeDataFile: async (name: string) => void data.delete(name),
}));

vi.mock("#lib/app/files/files.js", async (original) => {
  const actual = await original<typeof import("#lib/app/files/files.js")>();
  const png = new Uint8Array([1, 2, 3]);
  return {
    ...actual,
    renderPng: async () => png,
    encodeDocument: async (doc: Parameters<typeof writeDidi>[0]) => ({
      file: writeDidi(doc, png),
      thumbnail: png,
    }),
    decodeDocument: async (bytes: Uint8Array) => ({ doc: readDidi(bytes), thumbnail: png }),
    saveDocument: async (path: string, doc: Parameters<typeof writeDidi>[0]) => {
      disk.set(path, writeDidi(doc, png));
      return png;
    },
    openDocument: async (path: string) => {
      const bytes = disk.get(path);
      if (!bytes) {
        throw new Error("No such file");
      }
      return { doc: readDidi(bytes), thumbnail: png };
    },
  };
});

const { Session } = await import("#lib/app/files/session.svelte.js");

function setup(choice: UnsavedChoice = "cancel") {
  const host = { notify: vi.fn(), askUnsaved: vi.fn(async () => choice) };
  return { session: new Session(host), host };
}

const paint = (session: InstanceType<typeof Session>) =>
  commandsOf(session.editor).execute("layer.add");

/** A document with three layers, as a crash would have left it. */
function documentWithLayers() {
  const editor = newEditor(16, 16, "transparent");
  commandsOf(editor).execute("layer.add");
  commandsOf(editor).execute("layer.add");
  return documentFromEditor(editor);
}

beforeEach(() => {
  disk.clear();
  data.clear();
  dialogs.open = dialogs.save = null;
  browser.active = browser.cancel = false;
  browser.written = [];
  writeFails.active = false;
  vi.useRealTimers();
});

describe("Session", () => {
  it("keeps the document in a browser, and brings it back by itself", async () => {
    browser.active = true;
    vi.useFakeTimers();
    const { session } = setup();
    expect(await session.start()).toBe(false);
    paint(session);
    expect(session.unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(session.unsaved).toBe(false);
    const layers = session.editor.drawing.layers.length;

    const { session: next } = setup();
    expect(await next.start()).toBe(true);
    expect(next.editor.drawing.layers).toHaveLength(layers);
    // Still kept, in case the tab closes again before any change.
    expect(data.has("recovery.didi")).toBe(true);
    expect(next.untouched).toBe(false);
    expect(next.unsaved).toBe(false);
  });

  it("forgets the browser's copy once everything is undone, or the document replaced", async () => {
    browser.active = true;
    vi.useFakeTimers();
    const { session } = setup("discard");
    paint(session);
    await vi.advanceTimersByTimeAsync(3000);
    expect(data.has("recovery.didi")).toBe(true);
    session.editor.history.undo();
    expect(session.unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(data.has("recovery.didi")).toBe(false);
    expect(session.unsaved).toBe(false);

    paint(session);
    await vi.advanceTimersByTimeAsync(3000);
    await session.newDocument(8, 8, "transparent");
    await vi.advanceTimersByTimeAsync(0);
    expect(data.has("recovery.didi")).toBe(false);
    expect(await setup().session.start()).toBe(false);
  });

  it("exports a PNG where the browser's dialog says", async () => {
    browser.active = true;
    const { session, host } = setup();
    await session.exportPng();
    expect(browser.written).toEqual(["Untitled.png"]);
    expect(host.notify).not.toHaveBeenCalled();
  });

  it("exports nothing if the browser's dialog is cancelled", async () => {
    browser.active = browser.cancel = true;
    const { session, host } = setup();
    await session.exportPng();
    expect(browser.written).toEqual([]);
    expect(host.notify).not.toHaveBeenCalled();
  });

  it("tracks unsaved changes, and saves to the chosen file", async () => {
    const { session } = setup();
    expect(session.dirty).toBe(false);
    paint(session);
    expect(session.dirty).toBe(true);
    dialogs.save = "/art/hero";
    expect(await session.save()).toBe(true);
    expect(session.path).toBe("/art/hero.didi");
    expect(session.name).toBe("hero");
    expect(session.dirty).toBe(false);
    expect(readDidi(disk.get("/art/hero.didi")!).layers).toHaveLength(3);
    session.editor.history.undo();
    expect(session.dirty).toBe(true);
    session.editor.history.redo();
    expect(session.dirty).toBe(false);
    expect(session.recent.map((f) => f.path)).toEqual(["/art/hero.didi"]);
  });

  it("counts a layer's visibility as an unsaved change, though it is not an undo step", async () => {
    const { session } = setup();
    const { editor } = session;
    const { id } = editor.drawing.layers[0];
    const setVisible = (visible: boolean) =>
      commandsOf(editor).execute("layer.update", { id, changes: { visible } });

    setVisible(false);
    expect(session.dirty).toBe(true);
    expect(editor.history.canUndo).toBe(false);
    setVisible(true);
    expect(session.dirty).toBe(false);

    setVisible(false);
    dialogs.save = "/art/hero";
    expect(await session.save()).toBe(true);
    expect(session.dirty).toBe(false);
    setVisible(true);
    expect(session.dirty).toBe(true);
  });

  it("does not save when the dialog is cancelled", async () => {
    const { session } = setup();
    paint(session);
    expect(await session.save()).toBe(false);
    expect(session.dirty).toBe(true);
  });

  it("asks before losing changes, and respects the answer", async () => {
    const cancel = setup("cancel");
    paint(cancel.session);
    const before = cancel.session.editor;
    await cancel.session.newDocument(64, 64, "white");
    expect(cancel.host.askUnsaved).toHaveBeenCalledWith("Untitled");
    expect(cancel.session.editor).toBe(before);

    const discard = setup("discard");
    paint(discard.session);
    await discard.session.newDocument(64, 32, "transparent");
    expect(discard.session.editor.drawing.width).toBe(64);
    expect(discard.session.dirty).toBe(false);

    const save = setup("save");
    paint(save.session);
    dialogs.save = "/a.didi";
    await save.session.newDocument(16, 16, "white");
    expect(disk.has("/a.didi")).toBe(true);
    expect(save.session.editor.drawing.width).toBe(16);
  });

  it("keeps the mode with the document: saved, reopened, unsaved when changed", async () => {
    const { session } = setup("discard");
    await session.newDocument(16, 16, "white", "pixel");
    expect(session.mode).toBe("pixel");
    expect(session.dirty).toBe(false);
    session.setMode("painting");
    expect(session.dirty).toBe(true);
    session.setMode("pixel");
    expect(session.dirty).toBe(false);
    session.setMode("painting");
    dialogs.save = "/m.didi";
    await session.save();
    expect(session.dirty).toBe(false);
    expect(readDidi(disk.get("/m.didi")!).mode).toBe("painting");
    expect(session.recent[0]).toMatchObject({ path: "/m.didi", mode: "painting" });

    await session.newDocument(16, 16, "white", "pixel");
    await session.open("/m.didi");
    expect(session.mode).toBe("painting");
    expect(session.dirty).toBe(false);
  });

  it("keeps the tiles' grid with the document: saved, reopened, unsaved when changed", async () => {
    const { session } = setup("discard");
    await session.newDocument(16, 16, "white", "pixel");
    expect(session.grid).toEqual({ width: 16, height: 16, shown: false });
    session.setGrid({ width: 8, height: 8, shown: false });
    expect(session.dirty).toBe(true);
    session.setGrid({ width: 16, height: 16, shown: false });
    expect(session.dirty).toBe(false);
    session.setGrid({ width: 8, height: 8, shown: true });
    dialogs.save = "/g.didi";
    await session.save();
    expect(session.dirty).toBe(false);

    await session.newDocument(16, 16, "white", "pixel");
    expect(session.grid.shown).toBe(false);
    await session.open("/g.didi");
    expect(session.grid).toEqual({ width: 8, height: 8, shown: true });
    expect(session.dirty).toBe(false);
  });

  it("tells whether the document is untouched, and can be replaced without loss", async () => {
    const host = { notify: vi.fn(), askUnsaved: vi.fn(async () => "cancel" as const) };
    const session = new Session(host, undefined, "pixel");
    expect(session.mode).toBe("pixel");
    expect(session.dirty).toBe(false);
    expect(session.untouched).toBe(true);
    paint(session);
    expect(session.untouched).toBe(false);
    session.editor.history.undo();
    // Not dirty, but the change can be redone: still worth keeping.
    expect(session.dirty).toBe(false);
    expect(session.untouched).toBe(false);

    const saved = setup().session;
    dialogs.save = "/u.didi";
    await saved.save();
    expect(saved.untouched).toBe(false);
  });

  it("opens files, and tells why one cannot be opened", async () => {
    const { session: writer } = setup();
    paint(writer);
    dialogs.save = "/b.didi";
    await writer.save();

    const { session, host } = setup();
    await session.open("/b.didi");
    expect(session.name).toBe("b");
    expect(session.editor.drawing.layers).toHaveLength(3);
    expect(session.dirty).toBe(false);

    disk.set("/broken.didi", new Uint8Array([1, 2, 3]));
    const before = session.editor;
    await session.open("/broken.didi");
    expect(host.notify).toHaveBeenCalledWith(
      expect.stringMatching(/Cannot open broken.didi: .*not a Didi file/),
    );
    expect(session.editor).toBe(before);
    expect(session.busy).toBeNull();
  });

  it("has a copy to offer a few seconds after a change, if the app gets killed", async () => {
    vi.useFakeTimers();
    const { session: killed } = setup();
    paint(killed);
    expect(data.has("recovery.didi")).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(data.has("recovery.didi")).toBe(true);
    const layers = killed.editor.drawing.layers.length;

    const { session } = setup();
    await session.start();
    expect(session.recovery).toMatchObject({ name: "Untitled", path: null });
    await session.recover();
    expect(session.editor.drawing.layers).toHaveLength(layers);
    expect(session.dirty).toBe(true);
  });

  it("offers the copy left by a crash, until it is recovered or discarded", async () => {
    // A previous session left a recovery copy.
    const { session: crashed } = setup();
    paint(crashed);
    dialogs.save = "/c.didi";
    await crashed.save();
    paint(crashed);
    data.set("recovery.didi", disk.get("/c.didi")!);
    data.set("recovery.json", JSON.stringify({ name: "c", path: "/c.didi", time: 1 }));

    const { session } = setup();
    await session.start();
    expect(session.recovery).toMatchObject({ name: "c", path: "/c.didi" });
    // Moved aside: this session's own copy can be written without losing it.
    expect(data.has("recovery.didi")).toBe(false);

    await session.recover();
    expect(session.name).toBe("c");
    expect(session.path).toBe("/c.didi");
    expect(session.dirty).toBe(true);
    expect(session.recovery).toBeNull();
    expect(data.has("recovery-previous.didi")).toBe(false);
  });

  it("can still recover a recovered document after another crash, without any change", async () => {
    data.set("recovery-previous.didi", writeDidi(documentWithLayers(), new Uint8Array([1])));
    data.set("recovery-previous.json", JSON.stringify({ name: "c", path: "/c.didi", time: 1 }));

    const { session: crashed } = setup();
    await crashed.start();
    await crashed.recover();

    const { session } = setup();
    await session.start();
    expect(session.recovery).toMatchObject({ name: "c", path: "/c.didi" });
    await session.recover();
    expect(session.editor.drawing.layers).toHaveLength(3);
  });

  it("keeps the copy left by a crash if a new copy cannot be written", async () => {
    data.set("recovery-previous.didi", writeDidi(documentWithLayers(), new Uint8Array([1])));
    data.set("recovery-previous.json", JSON.stringify({ name: "c", path: "/c.didi", time: 1 }));
    writeFails.active = true;

    const { session, host } = setup();
    await session.start();
    await session.recover();

    expect(host.notify).toHaveBeenCalled();
    expect(session.recovery).toMatchObject({ name: "c" });
    expect(data.has("recovery-previous.didi")).toBe(true);
  });
});
