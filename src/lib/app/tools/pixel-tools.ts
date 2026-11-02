// Pixel art tools: whole pixels, no anti-aliasing.

import { Grid2x2, Grid2x2X } from "@lucide/svelte";
import { PixelPathBuilder } from "#lib/core/brush/pixel-path.js";
import { StrokeRaster } from "#lib/core/brush/raster.js";
import { defineTool, type Sample, type Tool, type ToolStroke } from "./tool";

export const MAX_PIXEL_SIZE = 64;

export type PixelSettings = {
  /** Diameter in whole pixels. */
  size: number;
  opacity: number;
  /** Removes "L" corners (only with a 1-pixel brush). */
  pixelPerfect: boolean;
};

function pixelTool(id: string, title: string, icon: Tool["icon"], mode: "paint" | "erase") {
  return defineTool<PixelSettings>({
    id,
    title,
    icon,
    defaults: { size: 1, opacity: 1, pixelPerfect: true },
    fields: [
      { kind: "integer", key: "size", label: "Size", min: 1, max: MAX_PIXEL_SIZE, unit: "px" },
      { kind: "percent", key: "opacity", label: "Opacity" },
      {
        kind: "toggle",
        key: "pixelPerfect",
        label: "Pixel-perfect",
        title: "Removes L-shaped corners (1 px brush)",
      },
    ],
    cursor: (s) => ({ kind: "square", size: s.size }),
    resize: (s, direction) => (s.size = Math.min(MAX_PIXEL_SIZE, Math.max(1, s.size + direction))),
    begin(context, { size, opacity, pixelPerfect }) {
      const rounded = Math.max(1, Math.round(size));
      const raster = new StrokeRaster(context.editor.drawing, context.layer!.id, {
        color: context.color,
        opacity,
        mode,
      });
      const path = new PixelPathBuilder(pixelPerfect && rounded === 1);
      return new PixelStroke(raster, path, rounded, title);
    },
  });
}

export const pixelBrushTool = pixelTool("pixel", "Pixel brush", Grid2x2, "paint");
export const pixelEraserTool = pixelTool("pixelEraser", "Pixel eraser", Grid2x2X, "erase");

class PixelStroke implements ToolStroke {
  readonly busy = false;

  constructor(
    private readonly raster: StrokeRaster,
    private readonly path: PixelPathBuilder,
    private readonly size: number,
    private readonly label: string,
  ) {}

  move(s: Sample) {
    const { paint, unpaint } = this.path.add(s.x, s.y);
    this.raster.setPixels(unpaint, this.size, false);
    this.raster.setPixels(paint, this.size, true);
  }

  flush() {
    this.raster.flush();
  }

  drain() {}

  finish() {
    return this.raster.finish(this.label);
  }

  cancel() {
    this.raster.cancel();
  }
}
