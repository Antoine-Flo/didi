import { describe, expect, it, vi } from "vitest";
import { documentFromEditor } from "#lib/core/file/didi-file.js";
import { newEditor } from "#lib/app/files/new-drawing.js";

const data = new Map<string, Uint8Array | string>();
/** Holds binary writes until released, to see what happens meanwhile. */
const slow = { held: null as (() => void) | null };

vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => (data.get(name) as string | undefined) ?? null,
  writeDataFile: async (name: string, text: string) => void data.set(name, text),
  readDataBytes: async (name: string) => (data.get(name) as Uint8Array | undefined) ?? null,
  writeDataBytes: async (name: string, bytes: Uint8Array) => {
    await new Promise<void>((resolve) => (slow.held = resolve));
    data.set(name, bytes);
  },
  removeDataFile: async (name: string) => void data.delete(name),
}));

vi.mock("#lib/app/files/files.js", () => ({
  encodeDocument: async () => ({ file: new Uint8Array([1]), thumbnail: new Uint8Array() }),
}));

const { RecoveryCopy } = await import("#lib/app/files/recovery-copy.svelte.js");

describe("RecoveryCopy", () => {
  it("removes the copy after a write in progress, not before: it does not come back", async () => {
    const doc = documentFromEditor(newEditor(8, 8, "transparent"));
    const copy = new RecoveryCopy({
      needsCopy: () => true,
      snapshot: () => ({ doc, info: { name: "a", path: null, time: 0 } }),
      onError: () => {},
    });
    const write = copy.writeNow();
    await vi.waitFor(() => expect(slow.held).not.toBeNull());
    const removed = copy.remove();
    slow.held!();
    await Promise.all([write, removed]);
    expect(data.has("recovery.didi")).toBe(false);
    expect(data.has("recovery.json")).toBe(false);
  });
});
