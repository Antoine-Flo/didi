import { describe, expect, it } from "vitest";
import { toCanvas, toScreen, type Camera } from "#lib/render/camera.js";
import {
  GESTURE_GRACE_MS,
  ROTATE_START,
  TAP_MS,
  TAP_SLOP,
  TouchGestures,
} from "./touch-gestures";

function setup(options: { fingerDraws?: boolean; mayRotate?: boolean; refuse?: boolean } = {}) {
  const calls: string[] = [];
  let camera: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
  const gestures = new TouchGestures({
    camera: () => camera,
    setCamera: (c) => (camera = c),
    fingerDraws: () => options.fingerDraws ?? false,
    mayRotate: () => options.mayRotate ?? true,
    beginStroke: () => {
      calls.push("begin");
      return !options.refuse;
    },
    moveStroke: () => void calls.push("move"),
    endStroke: () => void calls.push("end"),
    cancelStroke: () => void calls.push("cancel"),
    undo: () => void calls.push("undo"),
    redo: () => void calls.push("redo"),
  });
  return { gestures, calls, camera: () => camera };
}

describe("TouchGestures", () => {
  it("undoes on a two-finger tap and redoes on a three-finger tap", () => {
    const { gestures, calls } = setup();
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.down(2, { x: 50, y: 0 }, 20);
    gestures.up(1, 100);
    gestures.up(2, 120);
    gestures.down(1, { x: 0, y: 0 }, 1000);
    gestures.down(2, { x: 50, y: 0 }, 1010);
    gestures.down(3, { x: 100, y: 0 }, 1020);
    gestures.move(3, { x: 103, y: 2 }, 1050);
    for (const id of [1, 2, 3]) gestures.up(id, 1100);
    expect(calls).toEqual(["undo", "redo"]);
  });

  it("does not take a slow or moving touch for a tap", () => {
    const { gestures, calls } = setup();
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.down(2, { x: 50, y: 0 }, 0);
    gestures.up(1, TAP_MS + 1);
    gestures.up(2, TAP_MS + 1);
    gestures.down(1, { x: 0, y: 0 }, 1000);
    gestures.down(2, { x: 50, y: 0 }, 1000);
    gestures.move(2, { x: 50 + TAP_SLOP + 1, y: 0 }, 1010);
    gestures.up(1, 1050);
    gestures.up(2, 1050);
    expect(calls).toEqual([]);
  });

  it("keeps the canvas under two fingers that move apart", () => {
    const { gestures, camera } = setup({ mayRotate: false });
    const a = { x: 100, y: 100 };
    const b = { x: 200, y: 100 };
    const underA = toCanvas(camera(), a);
    const underB = toCanvas(camera(), b);
    gestures.down(1, a, 0);
    gestures.down(2, b, 0);
    gestures.move(1, { x: 40, y: 120 }, 10);
    gestures.move(2, { x: 240, y: 120 }, 10);
    expect(camera().zoom).toBeCloseTo(2);
    const nowA = toScreen(camera(), underA);
    const nowB = toScreen(camera(), underB);
    expect(nowA.x).toBeCloseTo(40);
    expect(nowA.y).toBeCloseTo(120);
    expect(nowB.x).toBeCloseTo(240);
    expect(camera().rotation).toBe(0);
  });

  it("turns the view only past a threshold, and only where allowed", () => {
    const turned = (mayRotate: boolean, angle: number) => {
      const { gestures, camera } = setup({ mayRotate });
      gestures.down(1, { x: 0, y: 0 }, 0);
      gestures.down(2, { x: 100, y: 0 }, 0);
      // Turn in small steps, around the first finger.
      for (let i = 1; i <= 10; i++) {
        const t = (angle * i) / 10;
        gestures.move(2, { x: 100 * Math.cos(t), y: 100 * Math.sin(t) }, i);
      }
      return camera().rotation;
    };
    expect(turned(true, ROTATE_START / 2)).toBe(0);
    expect(turned(false, Math.PI / 2)).toBe(0);
    // It turns from where the threshold was passed.
    expect(turned(true, Math.PI / 2)).toBeGreaterThan(Math.PI / 2 - 2 * ROTATE_START);
  });

  it("moves the view with one finger once a pen was seen", () => {
    const { gestures, calls, camera } = setup({ fingerDraws: false });
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.move(1, { x: 30, y: 40 }, 10);
    gestures.up(1, 20);
    expect(camera()).toMatchObject({ x: 30, y: 40 });
    expect(calls).toEqual([]);
  });

  it("draws with one finger, and abandons the stroke when a gesture starts", () => {
    const { gestures, calls } = setup({ fingerDraws: true });
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.move(1, { x: 5, y: 0 }, 10);
    gestures.down(2, { x: 50, y: 0 }, GESTURE_GRACE_MS - 1);
    gestures.up(1, 260);
    gestures.up(2, 270);
    expect(calls).toEqual(["begin", "move", "cancel", "undo"]);
  });

  it("keeps a long stroke when a second finger lands, then navigates", () => {
    const { gestures, calls, camera } = setup({ fingerDraws: true, mayRotate: false });
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.down(2, { x: 50, y: 0 }, GESTURE_GRACE_MS + 1);
    gestures.move(1, { x: 0, y: 20 }, 400);
    gestures.move(2, { x: 50, y: 20 }, 400);
    expect(calls).toEqual(["begin", "end"]);
    expect(camera().y).toBeCloseTo(20);
  });

  it("navigates with a finger that may not draw", () => {
    const { gestures, calls, camera } = setup({ fingerDraws: true, refuse: true });
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.move(1, { x: 0, y: 30 }, 10);
    expect(calls).toEqual(["begin"]);
    expect(camera().y).toBe(30);
  });

  it("does not tap after a cancel", () => {
    const { gestures, calls } = setup();
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.down(2, { x: 50, y: 0 }, 0);
    gestures.cancel(1);
    gestures.up(2, 10);
    expect(calls).toEqual([]);
  });

  it("lets the hand rest once the pen came down", () => {
    const { gestures, calls, camera } = setup({ fingerDraws: true });
    gestures.down(1, { x: 0, y: 0 }, 0);
    gestures.abandon();
    gestures.down(2, { x: 50, y: 0 }, 10);
    gestures.move(1, { x: 0, y: 50 }, 20);
    gestures.up(1, 30);
    gestures.up(2, 40);
    expect(calls).toEqual(["begin", "end"]);
    expect(camera().y).toBe(0);
    // Then gestures work again.
    gestures.down(1, { x: 0, y: 0 }, 100);
    gestures.down(2, { x: 50, y: 0 }, 110);
    gestures.up(1, 150);
    gestures.up(2, 160);
    expect(calls.at(-1)).toBe("undo");
  });
});
