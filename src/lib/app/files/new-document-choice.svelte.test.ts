import { describe, expect, it, vi } from "vitest";
import {
  NewDocumentChoice,
  NEW_DOCUMENT,
  validSize,
  MAX_SIZE,
} from "#lib/app/files/new-document-choice.svelte.js";

describe("NewDocumentChoice", () => {
  it("starts on the default size and background", () => {
    const choice = new NewDocumentChoice();
    expect([choice.width, choice.height, choice.background]).toEqual([
      NEW_DOCUMENT.width,
      NEW_DOCUMENT.height,
      NEW_DOCUMENT.background,
    ]);
  });

  it("tells a size or a background chosen, but not the same one again", () => {
    const onchange = vi.fn();
    const choice = new NewDocumentChoice(onchange);
    choice.setSize(64, 48);
    choice.setBackground("white");
    expect(onchange.mock.calls).toEqual([
      [64, 48, "transparent"],
      [64, 48, "white"],
    ]);
    choice.setSize(64, 48);
    choice.setBackground("white");
    expect(onchange).toHaveBeenCalledTimes(2);
  });

  it("tells a custom size only when it can be created", () => {
    const onchange = vi.fn();
    const choice = new NewDocumentChoice(onchange);
    choice.width = 0;
    choice.edited();
    expect(choice.valid).toBe(false);
    choice.width = 100;
    choice.edited();
    expect(choice.valid).toBe(true);
    expect(onchange.mock.calls).toEqual([[100, 64, "transparent"]]);
  });

  it("accepts whole sizes from 1 to the maximum", () => {
    expect([1, MAX_SIZE].every(validSize)).toBe(true);
    expect([0, MAX_SIZE + 1, 1.5, NaN].some(validSize)).toBe(false);
  });
});
