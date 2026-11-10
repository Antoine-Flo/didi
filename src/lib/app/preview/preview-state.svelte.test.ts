// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";

/** The preview windows opened, with what closing them from outside does. */
const windows: { close: ReturnType<typeof vi.fn>; closedOutside: () => void }[] = [];
vi.mock("#lib/platform/preview-window.js", () => ({
  openPreviewWindow: (onClosed: () => void) => {
    const opened = { close: vi.fn(), closedOutside: onClosed };
    windows.push(opened);
    return opened;
  },
}));
/** The drawings sent to the preview's window, and whether they still are. */
const sent: { drawing: Drawing; stopped: boolean }[] = [];
vi.mock("#lib/app/preview/preview-link.js", () => ({
  sendToWindow: (drawing: Drawing) => {
    const sending = { drawing, stopped: false };
    sent.push(sending);
    return () => (sending.stopped = true);
  },
}));

const { PreviewState } = await import("#lib/app/preview/preview-state.svelte.js");

let stop = () => {};
const current = $state({ drawing: new Drawing(8, 8) });

function setup() {
  windows.length = 0;
  sent.length = 0;
  let preview!: InstanceType<typeof PreviewState>;
  stop = $effect.root(() => {
    preview = new PreviewState(() => current.drawing);
  });
  flushSync();
  return preview;
}

afterEach(() => stop());

describe("PreviewState", () => {
  it("opens over the canvas without any window", () => {
    const preview = setup();
    preview.place = "in";
    flushSync();
    expect(preview.place).toBe("in");
    expect(windows).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("sends the drawing to its window while it is out, and closes it when back in", () => {
    const preview = setup();
    preview.place = "out";
    flushSync();
    expect(windows).toHaveLength(1);
    expect(sent.map((s) => s.stopped)).toEqual([false]);
    preview.place = "in";
    flushSync();
    expect(windows[0].close).toHaveBeenCalled();
    expect(sent[0].stopped).toBe(true);
  });

  it("sends the new drawing when the document changes", () => {
    const preview = setup();
    preview.place = "out";
    flushSync();
    current.drawing = new Drawing(4, 4);
    flushSync();
    expect(sent).toHaveLength(2);
    expect(sent[0].stopped).toBe(true);
    expect(sent[1].drawing).toBe(current.drawing);
  });

  it("is off once its window is closed from outside", () => {
    const preview = setup();
    preview.place = "out";
    flushSync();
    windows[0].closedOutside();
    flushSync();
    expect(preview.place).toBe("off");
    expect(sent[0].stopped).toBe(true);
  });

  it("ignores a former window closing", () => {
    const preview = setup();
    preview.place = "out";
    preview.place = "off";
    preview.place = "out";
    flushSync();
    windows[0].closedOutside();
    expect(preview.place).toBe("out");
  });

  it("does nothing when asked for the place it is at", () => {
    const preview = setup();
    preview.place = "out";
    preview.place = "out";
    expect(windows).toHaveLength(1);
  });

  it("closes its window when the editor closes", () => {
    const preview = setup();
    preview.place = "out";
    preview.closeWindow();
    expect(windows[0].close).toHaveBeenCalled();
  });
});
