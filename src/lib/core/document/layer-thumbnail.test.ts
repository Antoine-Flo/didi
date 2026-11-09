import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { contentBounds, layerThumbnail } from "#lib/core/document/layer-thumbnail.js";
import { fill } from "#lib/core/testing/test-utils.js";

describe("layer thumbnails", () => {
  it("keeps the aspect ratio and shows where the pixels are", () => {
    const drawing = new Drawing(600, 300);
    const layer = drawing.createLayer();
    drawing.addLayer(layer);
    // The left half opaque red.
    const left = { x: 0, y: 0, width: 300, height: 300 };
    drawing.writePixels(layer.id, left, fill(left, [255, 0, 0, 255]));
    const thumb = layerThumbnail(drawing.getLayer(layer.id).tiles, 60);
    expect([thumb.width, thumb.height]).toEqual([60, 30]);
    const at = (x: number, y: number) => [
      ...thumb.data.slice((y * 60 + x) * 4, (y * 60 + x) * 4 + 4),
    ];
    expect(at(10, 15)).toEqual([255, 0, 0, 255]);
    expect(at(50, 15)).toEqual([0, 0, 0, 0]);
  });

  it("does not enlarge small layers", () => {
    const drawing = new Drawing(16, 8);
    const layer = drawing.createLayer();
    drawing.addLayer(layer);
    const thumb = layerThumbnail(drawing.getLayer(layer.id).tiles, 48);
    expect([thumb.width, thumb.height]).toEqual([16, 8]);
  });

  it("finds the content's bounds, across tiles", () => {
    const drawing = new Drawing(600, 600);
    const layer = drawing.createLayer();
    drawing.addLayer(layer);
    const tiles = () => drawing.getLayer(layer.id).tiles;
    expect(contentBounds(tiles())).toBeNull();
    const a = { x: 10, y: 20, width: 5, height: 5 };
    const b = { x: 300, y: 400, width: 3, height: 2 };
    drawing.writePixels(layer.id, a, fill(a, [0, 0, 0, 255]));
    drawing.writePixels(layer.id, b, fill(b, [0, 0, 0, 10]));
    expect(contentBounds(tiles())).toEqual({ x: 10, y: 20, width: 293, height: 382 });
  });

  it("previews just an area, e.g. the content", () => {
    const drawing = new Drawing(512, 512);
    const layer = drawing.createLayer();
    drawing.addLayer(layer);
    const dot = { x: 250, y: 250, width: 4, height: 2 };
    drawing.writePixels(layer.id, dot, fill(dot, [0, 255, 0, 255]));
    const tiles = drawing.getLayer(layer.id).tiles;
    const thumb = layerThumbnail(tiles, 48, contentBounds(tiles)!);
    expect([thumb.width, thumb.height]).toEqual([4, 2]);
    expect([...thumb.data]).toEqual(new Array(8).fill([0, 255, 0, 255]).flat());
  });
});
