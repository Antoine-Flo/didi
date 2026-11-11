import { describe, expect, it, vi } from "vitest";
import {
  NewDocumentChoice,
  validSize,
  MAX_SIZE,
} from "#lib/app/files/new-document-choice.svelte.js";
import type { Mode } from "#lib/app/modes/mode.js";

const mode = (id: string, width: number, background: "white" | "transparent") =>
  ({
    id,
    newDocument: { presets: [], size: { width, height: width }, background },
  }) as unknown as Mode;

const pixel = mode("pixel", 32, "transparent");
const paint = mode("paint", 1920, "white");
const modes = [pixel, paint];

const state = (choice: NewDocumentChoice) => ({
  mode: choice.mode.id,
  width: choice.width,
  height: choice.height,
  background: choice.background,
});

describe("NewDocumentChoice", () => {
  it("starts on the mode given, with its size and background", () => {
    expect(state(new NewDocumentChoice(modes, "paint"))).toEqual({
      mode: "paint",
      width: 1920,
      height: 1920,
      background: "white",
    });
    // Not a mode: the first one.
    expect(new NewDocumentChoice(modes, "gone").mode).toBe(pixel);
  });

  it("takes the mode's size and background when choosing it, and tells it", () => {
    const onchange = vi.fn();
    const choice = new NewDocumentChoice(modes, "pixel", onchange);
    choice.setSize(64, 48);
    choice.choose(paint);
    expect(state(choice)).toEqual({
      mode: "paint",
      width: 1920,
      height: 1920,
      background: "white",
    });
    expect(onchange).toHaveBeenLastCalledWith(1920, 1920, "white", "paint");
    // The same mode again: nothing changes.
    choice.setBackground("transparent");
    onchange.mockClear();
    choice.choose(paint);
    expect(choice.background).toBe("transparent");
    expect(onchange).not.toHaveBeenCalled();
  });

  it("tells a size or a background chosen, but not the same one again", () => {
    const onchange = vi.fn();
    const choice = new NewDocumentChoice(modes, "pixel", onchange);
    choice.setSize(64, 48);
    choice.setBackground("white");
    expect(onchange.mock.calls).toEqual([
      [64, 48, "transparent", "pixel"],
      [64, 48, "white", "pixel"],
    ]);
    choice.setSize(64, 48);
    choice.setBackground("white");
    expect(onchange).toHaveBeenCalledTimes(2);
  });

  it("tells a custom size only when it can be created", () => {
    const onchange = vi.fn();
    const choice = new NewDocumentChoice(modes, "pixel", onchange);
    choice.width = 0;
    choice.edited();
    expect(choice.valid).toBe(false);
    choice.width = 100;
    choice.edited();
    expect(choice.valid).toBe(true);
    expect(onchange.mock.calls).toEqual([[100, 32, "transparent", "pixel"]]);
  });

  it("accepts whole sizes from 1 to the maximum", () => {
    expect([1, MAX_SIZE].every(validSize)).toBe(true);
    expect([0, MAX_SIZE + 1, 1.5, NaN].some(validSize)).toBe(false);
  });
});
