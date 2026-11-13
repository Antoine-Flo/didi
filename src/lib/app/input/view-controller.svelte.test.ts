// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewController, type ViewTarget } from "#lib/app/input/view-controller.svelte.js";
import type { Camera } from "#lib/render/camera.js";

let stop = () => {};
afterEach(() => stop());

/** A 100×50 canvas, in a 400×400 view with no panels over it. */
function setup() {
  const controller = new ViewController({
    canvas: () => ({ width: 100, height: 50 }),
    insets: () => undefined,
  });
  const seen: Camera[] = [];
  stop = $effect.root(() => {
    $effect(() => void seen.push(controller.camera));
  });
  flushSync();
  return { controller, seen };
}

function target(): ViewTarget & { shown: Camera[] } {
  const shown: Camera[] = [];
  return {
    shown,
    size: () => ({ width: 400, height: 400 }),
    show: (camera) => shown.push(camera),
    previewResize: vi.fn(),
  };
}

describe("ViewController", () => {
  it("does nothing until a canvas shows it", () => {
    const { controller, seen } = setup();
    controller.fitView();
    controller.zoomStep(1);
    controller.zoomTo(2);
    controller.rotateBy(1);
    controller.resetRotation();
    controller.mirrorView();
    controller.previewResize(null);
    flushSync();
    expect(seen).toEqual([{ x: 0, y: 0, zoom: 1, rotation: 0 }]);
  });

  it("moves the view of the canvas attached, and follows its camera", () => {
    const { controller, seen } = setup();
    const view = target();
    controller.attach(view);
    controller.fitView();
    flushSync();
    // Fitted: the canvas's width in the view's, with a margin.
    expect(controller.camera.zoom).toBeGreaterThan(2);
    expect(controller.camera.zoom).toBeLessThan(4);
    const fitted = controller.camera.zoom;
    controller.zoomStep(1);
    controller.rotateBy(0.5);
    flushSync();
    // The next zoom level up.
    expect(controller.camera.zoom).toBeGreaterThan(fitted);
    expect(controller.camera.rotation).toBeCloseTo(0.5);
    expect(view.shown.at(-1)).toEqual(controller.camera);
    expect(seen.at(-1)).toEqual(controller.camera);
    controller.previewResize(null);
    expect(view.previewResize).toHaveBeenCalledWith(null);
  });

  it("starts each canvas attached from the start: not turned nor mirrored", () => {
    const { controller } = setup();
    controller.attach(target());
    controller.rotateBy(1);
    controller.mirrorView();
    const next = target();
    controller.attach(next);
    expect(controller.camera).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0 });
    expect(next.shown).toEqual([controller.camera]);
  });

  it("stops once detached, but not by a canvas already replaced", () => {
    const { controller } = setup();
    const first = target();
    const detachFirst = controller.attach(first);
    const second = target();
    const detachSecond = controller.attach(second);
    detachFirst();
    controller.zoomStep(1);
    expect(second.shown.at(-1)?.zoom).toBeGreaterThan(1);
    detachSecond();
    controller.zoomStep(1);
    controller.previewResize(null);
    expect(second.shown).toHaveLength(2);
    expect(second.previewResize).not.toHaveBeenCalled();
    expect(first.shown).toHaveLength(1);
  });
});
