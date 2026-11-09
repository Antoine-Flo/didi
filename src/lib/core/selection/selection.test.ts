import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { capture, expectSameState, fill } from "#lib/core/test-utils.js";
import { moveEdge, scaleRect, selectionHandles, zoneAt } from "#lib/core/selection/handles.js";
import { lift, showFloating } from "#lib/core/selection/selection.js";
import { maskOutline, shapeFrom, shapeMask } from "#lib/core/selection/shape.js";

const CANVAS = { x: 0, y: 0, width: 100, height: 100 };

describe("zones of a selection", () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };

  it("has content handles outside, bounds handles inside, and the center to move", () => {
    const zoom = 8;
    const handles = selectionHandles(rect, zoom);
    expect(handles.filter((h) => h.group === "content")).toHaveLength(8);
    expect(handles.filter((h) => h.group === "pivot")).toHaveLength(1);
    expect(handles.filter((h) => h.group === "bounds").map((h) => h.id)).toEqual([
      "n",
      "e",
      "s",
      "w",
    ]);
    for (const { group, shape } of handles) {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const inside = cx > 10 && cx < 30 && cy > 10 && cy < 30;
      expect(inside).toBe(group === "bounds" || group === "pivot");
    }
    expect(zoneAt(rect, 16, 16, zoom)).toEqual({ kind: "inside" });
    expect(zoneAt(rect, 20, 20, zoom)).toEqual({ kind: "pivot" });
    expect(zoneAt(rect, 32.5, 32.5, zoom)).toEqual({ kind: "rotate", id: "se" });
    expect(zoneAt(rect, 20, 7, zoom)).toEqual({ kind: "skew", side: "n" });
    expect(zoneAt(rect, 20, 11, zoom)).toEqual({ kind: "bounds", side: "n" });
    expect(zoneAt(rect, 29, 20, zoom)).toEqual({ kind: "bounds", side: "e" });
    expect(zoneAt(rect, 31.25, 31.25, zoom)).toEqual({ kind: "content", id: "se" });
    expect(zoneAt(rect, 60, 60, zoom)).toEqual({ kind: "outside" });
    // The band has an end, and follows a long side up to the corners.
    expect(zoneAt(rect, 20, 5, zoom)).toEqual({ kind: "outside" });
    expect(zoneAt(rect, 14, 8, zoom)).toEqual({ kind: "skew", side: "n" });
    expect(zoneAt(rect, 11, 8, zoom)).toEqual({ kind: "rotate", id: "nw" });
  });

  it("drops the bounds handles when the selection is small on screen", () => {
    const small = selectionHandles(rect, 2);
    expect(small.some((h) => h.group === "bounds" || h.group === "pivot")).toBe(false);
    expect(small).toHaveLength(8);
    expect(zoneAt(rect, 20, 11, 2)).toEqual({ kind: "inside" });
    // Zooming in brings them back.
    expect(selectionHandles(rect, 4).some((h) => h.group === "bounds")).toBe(true);
  });
});

describe("moveEdge", () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };

  it("moves only that edge", () => {
    expect(moveEdge(rect, "n", 5, CANVAS)).toEqual({ x: 10, y: 15, width: 20, height: 15 });
    expect(moveEdge(rect, "e", 5, CANVAS)).toEqual({ x: 10, y: 10, width: 25, height: 20 });
    expect(moveEdge(rect, "s", -5, CANVAS)).toEqual({ x: 10, y: 10, width: 20, height: 15 });
    expect(moveEdge(rect, "w", -5, CANVAS)).toEqual({ x: 5, y: 10, width: 25, height: 20 });
  });

  it("stays in the canvas, and at least 1 pixel wide", () => {
    expect(moveEdge(rect, "w", -50, CANVAS).x).toBe(0);
    expect(moveEdge(rect, "e", 500, CANVAS).width).toBe(90);
    expect(moveEdge(rect, "n", 500, CANVAS)).toEqual({ x: 10, y: 29, width: 20, height: 1 });
  });
});

describe("scaleRect", () => {
  const rect = { x: 10, y: 10, width: 20, height: 10 };

  it("keeps the opposite side or corner in place", () => {
    expect(scaleRect(rect, "se", 5, 5)).toMatchObject({ x: 10, y: 10, width: 25, height: 15 });
    expect(scaleRect(rect, "nw", 5, 5)).toMatchObject({ x: 15, y: 15, width: 15, height: 5 });
    expect(scaleRect(rect, "e", 5, 99)).toMatchObject({ x: 10, y: 10, width: 25, height: 10 });
    expect(scaleRect(rect, "n", 99, -5)).toMatchObject({ x: 10, y: 5, width: 20, height: 15 });
  });

  it("is 1 pixel wide when the handle reaches the opposite side", () => {
    expect(scaleRect(rect, "se", -20, -10)).toEqual({
      x: 10,
      y: 10,
      width: 1,
      height: 1,
      mirrorX: null,
      mirrorY: null,
    });
  });

  it("mirrors past the opposite side, across it", () => {
    expect(scaleRect(rect, "se", -25, 0)).toMatchObject({ width: 5, height: 10, mirrorX: 10 });
    expect(scaleRect(rect, "w", 25, 0)).toMatchObject({ x: 25, width: 5, mirrorX: 30 });
    expect(scaleRect(rect, "n", 0, 15)).toMatchObject({ y: 15, height: 5, mirrorY: 20 });
    expect(scaleRect(rect, "e", 5, 0)).toMatchObject({ mirrorX: null, mirrorY: null });
  });

  it("keeps the ratio on corners when asked", () => {
    expect(scaleRect(rect, "se", 20, 0, true)).toMatchObject({ width: 40, height: 20 });
    expect(scaleRect(rect, "e", 20, 0, true)).toMatchObject({ width: 40, height: 10 });
  });
});

describe("the shape of a lasso", () => {
  const rect = { x: 0, y: 0, width: 4, height: 4 };

  it("gives its outline as runs along the selected pixels", () => {
    const square = [
      { x: 1.5, y: 1.5 },
      { x: 2.5, y: 1.5 },
      { x: 2.5, y: 2.5 },
      { x: 1.5, y: 2.5 },
    ];
    const mask = shapeMask(rect, shapeFrom(square, rect));
    expect([...mask]).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
    expect(maskOutline(mask, 4, 4)).toEqual([
      { x0: 1, y0: 1, x1: 3, y1: 1 },
      { x0: 1, y0: 3, x1: 3, y1: 3 },
      { x0: 1, y0: 1, x1: 1, y1: 3 },
      { x0: 3, y0: 1, x1: 3, y1: 3 },
    ]);
  });

  it("follows the size of its rectangle", () => {
    const shape = shapeFrom(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      rect,
    );
    expect(shapeMask({ ...rect, width: 8 }, shape).every((v) => v === 1)).toBe(true);
    expect(shapeMask(rect, shape)).toHaveLength(16);
  });

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
