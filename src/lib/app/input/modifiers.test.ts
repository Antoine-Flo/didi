import { describe, expect, it } from "vitest";
import { modifiersAfter } from "#lib/app/input/modifiers.svelte.js";

const event = (type: string, key: string, flags: { alt?: boolean; shift?: boolean } = {}) => ({
  type,
  key,
  altKey: flags.alt ?? false,
  shiftKey: flags.shift ?? false,
  ctrlKey: false,
  metaKey: false,
});

describe("modifiersAfter", () => {
  it("releases Alt on its keyup, even if the flags still say it is held (GTK)", () => {
    expect(modifiersAfter(event("keyup", "Alt", { alt: true })).alt).toBe(false);
  });

  it("holds Alt on its keydown, even if the flags do not say so yet (GTK)", () => {
    expect(modifiersAfter(event("keydown", "Alt")).alt).toBe(true);
  });

  it("reads the flags for the other keys", () => {
    const keys = modifiersAfter(event("keydown", "a", { alt: true, shift: true }));
    expect(keys).toEqual({ shift: true, ctrl: false, alt: true });
  });
});
