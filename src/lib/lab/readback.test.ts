import { afterEach, describe, expect, it, vi } from "vitest";
import { median } from "#lib/lab/readback.js";

describe("median", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs once per frame and returns the middle value", async () => {
    let frames = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames++;
      queueMicrotask(() => callback(0));
      return frames;
    });
    const values = [5, 1, 4, 2, 3];
    let i = 0;
    expect(await median(5, () => values[i++])).toBe(3);
    expect(frames).toBe(5);
  });

  it("awaits async measures", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 0;
    });
    const values = [9, 7, 8];
    let i = 0;
    expect(await median(3, async () => values[i++])).toBe(8);
  });
});
