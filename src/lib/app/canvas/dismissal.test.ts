import { describe, expect, it } from "vitest";
import { consumeDismissal, popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";

describe("dismissal clicks", () => {
  it("draws normally without popups", () => {
    expect(consumeDismissal()).toBe(false);
    expect(consumeDismissal()).toBe(false);
  });

  it("swallows contacts while a popup is open, and just after it closes", () => {
    popupOpened();
    expect(consumeDismissal(1000)).toBe(true);
    expect(consumeDismissal(1001)).toBe(true);
    popupClosed(1100);
    expect(consumeDismissal(1200)).toBe(true);
    expect(consumeDismissal(1400)).toBe(false);
    // Closing twice does not leave a negative count.
    popupClosed(2000);
    popupOpened();
    popupClosed(2000);
    expect(consumeDismissal(3000)).toBe(false);
  });
});
