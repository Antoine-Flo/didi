import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { capture, expectSameState, fill } from "#lib/core/testing/test-utils.js";
import { lift, showFloating } from "#lib/core/selection/floating.js";

describe("the shape of a lasso", () => {
  const rect = { x: 0, y: 0, width: 4, height: 4 };

  it("lifts only its pixels", () => {
    const editor = new Editor(new Drawing(4, 4));
    editor.commands.execute("layer.add");
    const id = editor.activeLayer!.id;
    editor.drawing.writePixels(id, rect, fill(rect, [255, 0, 0, 255]));
    const mask = new Uint8Array(16);
    mask[5] = 1;
    const floating = lift(editor.drawing, id, rect, mask);
    const { tiles } = editor.activeLayer!;
    expect([...tiles.readRegion({ x: 1, y: 1, width: 1, height: 1 })]).toEqual([0, 0, 0, 0]);
    expect([...tiles.readRegion({ x: 0, y: 0, width: 1, height: 1 })]).toEqual([255, 0, 0, 255]);
    expect([...floating.pixels.slice(20, 24)]).toEqual([255, 0, 0, 255]);
    expect([...floating.pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });
});

describe("floating content", () => {
  function setup() {
    const editor = new Editor(new Drawing(16, 16));
    editor.commands.execute("layer.add");
    const id = editor.activeLayer!.id;
    const rect = { x: 2, y: 2, width: 2, height: 2 };
    // Red on the left column, blue on the right.
    editor.drawing.writePixels(
      id,
      rect,
      new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255]),
    );
    const pixel = (x: number, y: number) => [
      ...editor.activeLayer!.tiles.readRegion({ x, y, width: 1, height: 1 }),
    ];
    return { editor, id, rect, pixel };
  }

  it("lifts pixels out of their layer", () => {
    const { editor, id, rect, pixel } = setup();
    const floating = lift(editor.drawing, id, rect);
    expect(pixel(2, 2)).toEqual([0, 0, 0, 0]);
    expect([...floating.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it("shows it in a new place, without harming what it passes over", () => {
    const { editor, id, rect, pixel } = setup();
    const under = { x: 8, y: 8, width: 2, height: 2 };
    editor.drawing.writePixels(id, under, fill(under, [0, 255, 0, 255]));
    const floating = lift(editor.drawing, id, rect);
    const over = { ...rect, x: 8, y: 8 };
    showFloating(editor.drawing, floating, rect, over);
    expect(pixel(8, 8)).toEqual([255, 0, 0, 255]);
    showFloating(editor.drawing, floating, over, { ...rect, x: 12, y: 12 });
    expect(pixel(8, 8)).toEqual([0, 255, 0, 255]);
    expect(pixel(12, 12)).toEqual([255, 0, 0, 255]);
  });

  it("scales with exact pixels, always from the original", () => {
    const { editor, id, rect, pixel } = setup();
    const floating = lift(editor.drawing, id, rect);
    const big = { x: 2, y: 2, width: 4, height: 4 };
    showFloating(editor.drawing, floating, rect, big);
    expect(pixel(2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixel(3, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(4, 2)).toEqual([0, 0, 255, 255]);
    expect(pixel(5, 5)).toEqual([0, 0, 255, 255]);
    // Down to one pixel, then back: nothing was lost.
    const tiny = { x: 2, y: 2, width: 1, height: 1 };
    showFloating(editor.drawing, floating, big, tiny);
    expect(pixel(3, 2)).toEqual([0, 0, 0, 0]);
    showFloating(editor.drawing, floating, tiny, big);
    expect(pixel(5, 5)).toEqual([0, 0, 255, 255]);
  });

  it("blends over what is below, and may hang over the canvas", () => {
    const { editor, id, rect, pixel } = setup();
    const half = { x: 0, y: 0, width: 1, height: 1 };
    editor.drawing.writePixels(id, half, fill(half, [0, 0, 128, 128]));
    const floating = lift(editor.drawing, id, half);
    showFloating(editor.drawing, floating, half, { ...half, x: 2, y: 2 });
    expect(pixel(2, 2)).toEqual([127, 0, 128, 255]);
    showFloating(editor.drawing, floating, { ...half, x: 2, y: 2 }, { ...half, x: -5, y: -5 });
    expect(pixel(2, 2)).toEqual([255, 0, 0, 255]);
    expect(rect.width).toBe(2);
  });

  it("is applied or cancelled by the editor, as undo steps", () => {
    const { editor, id, rect, pixel } = setup();
    const before = capture(editor.drawing);
    const floating = lift(editor.drawing, id, rect);
    const moved = { ...rect, x: 8 };
    showFloating(editor.drawing, floating, rect, moved);
    editor.selection.set({ rect: moved, floating });

    editor.commands.execute("selection.cancel");
    expectSameState(capture(editor.drawing), before);
    expect(editor.selection.floating).toBeNull();
    expect(editor.selection.rect).toEqual(rect);
    editor.history.undo();
    expect(pixel(8, 2)).toEqual([255, 0, 0, 255]);
    expect(editor.selection.floating).toBe(floating);

    editor.commands.execute("selection.apply");
    expect(pixel(8, 2)).toEqual([255, 0, 0, 255]);
    expect(editor.selection.floating).toBeNull();
    expect(editor.selection.rect).toEqual(moved);
    expect(editor.commands.isEnabled("selection.apply")).toBe(false);

    editor.commands.execute("selection.cancel");
    expect(editor.selection.rect).toBeNull();
    expect(editor.commands.isEnabled("selection.cancel")).toBe(false);
    expect(editor.commands.isEnabled("selection.deselect")).toBe(false);
  });
});
