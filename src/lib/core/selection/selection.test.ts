import { describe, expect, it } from "vitest";
import { moveEdge, scaleRect, selectionHandles, zoneAt } from "#lib/core/selection/handles.js";
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
});
