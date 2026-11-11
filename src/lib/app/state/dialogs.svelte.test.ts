import { describe, expect, it } from "vitest";
import { EditorDialogs } from "#lib/app/state/dialogs.svelte.js";

const question = { title: "Delete", text: "Delete the layer?", action: "Delete" };

describe("EditorDialogs", () => {
  it("knows when any dialog is open", () => {
    const dialogs = new EditorDialogs(false);
    expect(dialogs.anyOpen).toBe(false);
    for (const open of ["commandPalette", "shortcuts", "about", "preferences", "grid"] as const) {
      dialogs[open] = true;
      expect(dialogs.anyOpen, open).toBe(true);
      dialogs[open] = false;
    }
    dialogs.size = "canvas";
    expect(dialogs.anyOpen).toBe(true);
    dialogs.size = null;
    expect(dialogs.anyOpen).toBe(false);
  });

  it("counts the dialogs that dim the window, one above another dimming it too", () => {
    const dialogs = new EditorDialogs(true);
    expect(dialogs.dimLayers).toBe(1);
    dialogs.whatsNew = true;
    expect(dialogs.dimLayers).toBe(2);
    dialogs.whatsNew = false;
    dialogs.start = false;
    // The preferences don't dim: the interface is seen while choosing its look.
    dialogs.preferences = true;
    expect(dialogs.dimLayers).toBe(0);
    expect(dialogs.anyOpen).toBe(true);
  });

  it("opens a dialog by its name", () => {
    const names = ["start", "commandPalette", "shortcuts", "about", "preferences", "grid"] as const;
    for (const name of names) {
      const dialogs = new EditorDialogs(false);
      dialogs.open(name);
      expect(dialogs[name], name).toBe(true);
    }
    const dialogs = new EditorDialogs(false);
    dialogs.open("canvasSize");
    expect(dialogs.size).toBe("canvas");
    dialogs.open("imageSize");
    expect(dialogs.size).toBe("image");
  });

  it("starts on the start screen if asked", () => {
    expect(new EditorDialogs(true).start).toBe(true);
    expect(new EditorDialogs(true).anyOpen).toBe(true);
    expect(new EditorDialogs(false).start).toBe(false);
  });

  it("answers the unsaved changes question once, then closes it", async () => {
    const dialogs = new EditorDialogs(false);
    const answer = dialogs.askUnsaved("drawing");
    expect(dialogs.unsaved?.name).toBe("drawing");
    expect(dialogs.anyOpen).toBe(true);
    dialogs.unsaved!.answer("save");
    expect(dialogs.unsaved).toBeNull();
    await expect(answer).resolves.toBe("save");
  });

  it("confirms an action when confirmed", async () => {
    const dialogs = new EditorDialogs(false);
    const answer = dialogs.confirm(question);
    expect(dialogs.confirmRequest).toMatchObject(question);
    dialogs.confirmRequest!.onconfirm();
    dialogs.closeConfirm();
    expect(dialogs.confirmRequest).toBeNull();
    await expect(answer).resolves.toBe(true);
  });

  it("answers no when closed without confirming", async () => {
    const dialogs = new EditorDialogs(false);
    const answer = dialogs.confirm(question);
    dialogs.closeConfirm();
    await expect(answer).resolves.toBe(false);
  });

  it("answers no to a question still waiting when another one comes", async () => {
    const dialogs = new EditorDialogs(false);
    const first = dialogs.confirm(question);
    const second = dialogs.confirm({ ...question, title: "Clear" });
    await expect(first).resolves.toBe(false);
    expect(dialogs.confirmRequest?.title).toBe("Clear");
    dialogs.confirmRequest!.onconfirm();
    await expect(second).resolves.toBe(true);
  });
});
