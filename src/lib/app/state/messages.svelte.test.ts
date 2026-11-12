// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INFO_MS, MAX_MESSAGES, Messages } from "#lib/app/state/messages.svelte.js";

const texts = (messages: Messages) => messages.list.map((m) => `${m.level}:${m.text}`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Messages", () => {
  it("stacks the messages, the latest last", () => {
    const messages = new Messages();
    messages.show("saving failed", "error");
    messages.show("nothing to paste", "info");
    expect(texts(messages)).toEqual(["error:saving failed", "info:nothing to paste"]);
  });

  it("remembers the last error, even closed, for bug reports", () => {
    const messages = new Messages();
    expect(messages.lastError).toBe("");
    messages.show("saving failed", "error");
    messages.show("nothing to paste", "info");
    messages.dismiss(messages.list[0].id);
    expect(messages.lastError).toBe("saving failed");
  });

  it("lets information go after a while, and keeps errors until closed", () => {
    const messages = new Messages();
    messages.show("saving failed", "error");
    messages.show("nothing to paste", "info");
    vi.advanceTimersByTime(INFO_MS - 1);
    expect(messages.list).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(texts(messages)).toEqual(["error:saving failed"]);
    vi.advanceTimersByTime(INFO_MS * 10);
    expect(messages.list).toHaveLength(1);
    messages.dismiss(messages.list[0].id);
    expect(messages.list).toEqual([]);
  });

  it("shows the same message twice in a row once, for as long as if it were new", () => {
    const messages = new Messages();
    messages.show("layer hidden", "info");
    vi.advanceTimersByTime(INFO_MS - 1000);
    messages.show("layer hidden", "info");
    expect(messages.list).toHaveLength(1);
    vi.advanceTimersByTime(INFO_MS - 1);
    expect(messages.list).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(messages.list).toEqual([]);
    // Not in a row: shown again.
    messages.show("a", "error");
    messages.show("b", "error");
    messages.show("a", "error");
    expect(texts(messages)).toEqual(["error:a", "error:b", "error:a"]);
    // The same text as another level: another message.
    messages.show("a", "info");
    expect(messages.list.at(-1)?.level).toBe("info");
  });

  it(`shows at most ${MAX_MESSAGES}, the oldest making room`, () => {
    const messages = new Messages();
    for (const text of ["1", "2", "3", "4"]) {
      messages.show(text, "error");
    }
    expect(texts(messages)).toEqual(["error:2", "error:3", "error:4"]);
  });

  it("closes the message asked, and only that one", () => {
    const messages = new Messages();
    messages.show("e1", "error");
    messages.show("i", "info");
    messages.show("e2", "error");
    messages.dismiss(messages.list[1].id);
    expect(texts(messages)).toEqual(["error:e1", "error:e2"]);
    // Closed early, information does not come back or remove another one later.
    vi.advanceTimersByTime(INFO_MS);
    expect(texts(messages)).toEqual(["error:e1", "error:e2"]);
  });

  it("keeps a message with a button until it is pressed or closed", () => {
    const messages = new Messages();
    const run = vi.fn();
    messages.show("Didi 0.2 is available", "info", { label: "Update", run });
    vi.advanceTimersByTime(INFO_MS * 10);
    expect(messages.list).toHaveLength(1);
    messages.act(messages.list[0].id);
    expect(messages.list).toEqual([]);
    expect(run).toHaveBeenCalledOnce();
    // Closed instead: the action does not run.
    messages.show("Didi 0.2 is available", "info", { label: "Update", run });
    messages.dismiss(messages.list[0].id);
    messages.act(0);
    expect(run).toHaveBeenCalledOnce();
  });
});
