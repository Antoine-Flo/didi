import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PenEvent } from "#lib/platform/pen.js";
import { DEVICE_SWITCH_MS, PenInput } from "#lib/app/input/pen-input.svelte.js";

function setup() {
  const calls: string[] = [];
  const state = { dismissal: false, onCanvas: true, refuse: false, active: false };
  const painter = {
    get active() {
      return state.active;
    },
    begin: (_: unknown, eraser = false) => {
      calls.push(eraser ? "begin eraser" : "begin");
      state.active = !state.refuse;
      return !state.refuse;
    },
    move: (samples: readonly unknown[]) => void calls.push(`move ${samples.length}`),
    end: () => {
      calls.push("end");
      state.active = false;
    },
    cancel: () => {
      calls.push("cancel");
      state.active = false;
    },
  };
  const input = new PenInput({
    painter,
    consumeDismissal: () => {
      const dismissed = state.dismissal;
      state.dismissal = false;
      return dismissed;
    },
    mayStartAt: () => state.onCanvas,
    sample: (e) => ({ x: e.x, y: e.y, pressure: e.pressure }),
  });
  return { input, calls, state };
}

const event = (phase: PenEvent["phase"], changes: Partial<PenEvent> = {}): PenEvent => ({
  phase,
  x: 10,
  y: 10,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  button: phase === "move" ? 0 : 1,
  source: "pen",
  pressed: phase !== "down",
  time: 0,
  sentAt: 0,
  ...changes,
});

const sample = { x: 1, y: 1, pressure: 1 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("PenInput with DOM events", () => {
  it("starts, follows and ends a stroke", () => {
    const { input, calls } = setup();
    expect(input.domDown(sample, false)).toBe(true);
    input.domMove([sample, sample]);
    input.domUp();
    expect(calls).toEqual(["begin", "move 2", "end"]);
    expect(input.stroking).toBe(false);
  });

  it("knows which end of the pen started the stroke", () => {
    const { input, calls } = setup();
    input.domDown(sample, true);
    expect(input.strokeEraser).toBe(true);
    expect(calls).toEqual(["begin eraser"]);
  });

  it("only closes a menu with a click that closes one", () => {
    const { input, calls, state } = setup();
    state.dismissal = true;
    expect(input.domDown(sample, false)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("is not stroking when the painter refuses (locked layer…)", () => {
    const { input, calls, state } = setup();
    state.refuse = true;
    expect(input.domDown(sample, false)).toBe(false);
    input.domMove([sample]);
    input.domUp();
    expect(calls).toEqual(["begin"]);
  });

  it("does not draw from DOM events once native events draw", () => {
    const { input, calls } = setup();
    input.useNative();
    expect(input.domDown(sample, false)).toBe(false);
    input.domMove([sample]);
    input.domUp();
    expect(calls).toEqual([]);
  });
});

describe("PenInput with native events", () => {
  it("ends a stroke a little after the pen is lifted", () => {
    const { input, calls } = setup();
    input.onNative(event("down"));
    input.onNative(event("move"));
    input.onNative(event("up"));
    expect(calls).toEqual(["begin", "move 1"]);
    vi.advanceTimersByTime(DEVICE_SWITCH_MS);
    expect(calls).toEqual(["begin", "move 1", "end"]);
    expect(input.stroking).toBe(false);
  });

  it("keeps the same stroke when the pen switches to its eraser without being lifted", () => {
    const { input, calls } = setup();
    input.onNative(event("down"));
    input.onNative(event("up"));
    input.onNative(event("down", { source: "eraser" }));
    vi.advanceTimersByTime(DEVICE_SWITCH_MS * 2);
    expect(calls).toEqual(["begin"]);
    expect(input.stroking).toBe(true);
    expect(input.strokeEraser).toBe(false);
    expect(input.hoverEraser).toBe(true);
  });

  it("ends the stroke when the release was missed, instead of drawing while hovering", () => {
    const { input, calls } = setup();
    input.onNative(event("down"));
    input.onNative(event("move", { pressed: false }));
    input.onNative(event("move", { pressed: false }));
    expect(calls).toEqual(["begin", "end"]);
  });

  it("only starts on the canvas, and not with a click that closes a menu", () => {
    const { input, calls, state } = setup();
    state.onCanvas = false;
    input.onNative(event("down"));
    state.onCanvas = true;
    state.dismissal = true;
    input.onNative(event("down"));
    expect(calls).toEqual([]);
  });

  it("ignores the barrel buttons", () => {
    const { input, calls } = setup();
    input.onNative(event("down", { button: 2 }));
    expect(calls).toEqual([]);
  });

  it("follows which end of the pen hovers", () => {
    const { input } = setup();
    input.onNative(event("move", { source: "eraser" }));
    expect(input.hoverEraser).toBe(true);
    input.onNative(event("move", { source: "mouse" }));
    expect(input.hoverEraser).toBe(true);
    input.onNative(event("move", { source: "pen" }));
    expect(input.hoverEraser).toBe(false);
  });
});

describe("PenInput.cancel", () => {
  it("abandons the stroke, and a lift waiting to end it ends nothing", () => {
    const { input, calls } = setup();
    input.onNative(event("down"));
    input.onNative(event("up"));
    expect(input.cancel()).toBe(true);
    vi.advanceTimersByTime(DEVICE_SWITCH_MS);
    expect(calls).toEqual(["begin", "cancel"]);
  });

  it("also abandons a lifted stroke still being painted", () => {
    const { input, calls, state } = setup();
    state.active = true;
    expect(input.cancel()).toBe(true);
    expect(calls).toEqual(["cancel"]);
  });

  it("does nothing without a stroke", () => {
    const { input, calls } = setup();
    expect(input.cancel()).toBe(false);
    expect(calls).toEqual([]);
  });
});
