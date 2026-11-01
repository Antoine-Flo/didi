import { describe, expect, it } from "vitest";
import { consumeDismissal, markDismissal } from "./dismissal";

describe("dismissal clicks", () => {
  it("swallows exactly one contact after a mark", () => {
    expect(consumeDismissal()).toBe(false);
    markDismissal();
    markDismissal();
    expect(consumeDismissal()).toBe(true);
    expect(consumeDismissal()).toBe(false);
  });
});
