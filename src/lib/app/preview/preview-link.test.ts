import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { TILE_SIZE, tileKey } from "#lib/core/document/tiles.js";
import { changedRect } from "./preview-link";

describe("changedRect", () => {
  const drawing = new Drawing(600, 300);

  it("covers the changed areas of the tiles, in canvas pixels", () => {
    const rect = changedRect(
      {
        type: "pixels-changed",
        id: "1",
        tiles: [tileKey(0, 0), tileKey(1, 0)],
        areas: [
          { x: 10, y: 20, width: 5, height: 5 },
          { x: 0, y: 0, width: 4, height: 30 },
        ],
      },
      drawing,
    );
    expect(rect).toEqual({ x: 10, y: 0, width: TILE_SIZE + 4 - 10, height: 30 });
  });

  it("stops at the canvas's edges", () => {
    const rect = changedRect({ type: "pixels-changed", id: "1", tiles: [tileKey(2, 1)] }, drawing);
    expect(rect).toEqual({ x: 512, y: 256, width: 88, height: 44 });
  });

  it("is the whole image for other changes", () => {
    const rect = changedRect({ type: "layer-updated", id: "1", keys: ["visible"] }, drawing);
    expect(rect).toEqual({ x: 0, y: 0, width: 600, height: 300 });
  });
});
