import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDidi, writeDidi } from "#lib/core/didi-file.js";
import type { UnsavedChoice } from "./session.svelte";

// Files and app data in memory, and the worker's work done directly.
const disk = new Map<string, Uint8Array>();
const data = new Map<string, Uint8Array | string>();
const dialogs = { open: null as string | null, save: null as string | null };

vi.mock("#lib/platform/storage.js", () => ({
  canUseFiles: () => true,
  readFile: async (path: string) => {
    const bytes = disk.get(path);
    if (!bytes) throw new Error("No such file");
    return bytes.slice();
  },
  writeFile: async (path: string, bytes: Uint8Array) => void disk.set(path, bytes.slice()),
  chooseFileToOpen: async () => dialogs.open,
  chooseFileToSave: async () => dialogs.save,
  readDataFile: async (name: string) => (data.get(name) as string | undefined) ?? null,
  writeDataFile: async (name: string, text: string) => void data.set(name, text),
  readDataBytes: async (name: string) => (data.get(name) as Uint8Array | undefined) ?? null,
  writeDataBytes: async (name: string, bytes: Uint8Array) => void data.set(name, bytes),
  removeDataFile: async (name: string) => void data.delete(name),
}));

vi.mock("./files", async (original) => {
  const actual = await original<typeof import("./files")>();
  const png = new Uint8Array([1, 2, 3]);
  return {
    ...actual,
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
      if (!bytes) throw new Error("No such file");
      return { doc: readDidi(bytes), thumbnail: png };
    },
  };
});

const { Session } = await import("./session.svelte");

function setup(choice: UnsavedChoice = "cancel") {
  const host = { notify: vi.fn(), askUnsaved: vi.fn(async () => choice) };
  return { session: new Session(host), host };
}

const paint = (session: InstanceType<typeof Session>) =>
  session.editor.commands.execute("layer.add");

beforeEach(() => {
  disk.clear();
  data.clear();
  dialogs.open = dialogs.save = null;
});

describe("Session", () => {
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
});
