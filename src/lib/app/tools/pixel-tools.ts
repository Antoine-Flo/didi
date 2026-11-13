// Pixel art tools: whole pixels, no anti-aliasing.

import { selectionClip } from "#lib/core/selection/selection.js";
import { Circle, Eraser, Pencil, Square } from "@lucide/svelte";
import { PixelPathBuilder } from "#lib/core/brush/pixel-path.js";
import { StrokeRaster, type StampShape } from "#lib/core/brush/raster.js";
import {
  defineTool,
  type Sample,
  type Tool,
  type ToolMenu,
  type ToolStroke,
} from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

export const MAX_PIXEL_SIZE = 64;

export type PixelSettings = {
  /** Diameter in whole pixels. */
  size: number;
  opacity: number;
  /** Removes "L" corners (only with a 1-pixel brush). */
  pixelPerfect: boolean;
  /** The tip, chosen in the popup under the tool's button. */
  shape: StampShape;
};

/** Round or square tip, like Aseprite's brush types. */
export const TIP_MENU: ToolMenu = {
  key: "shape",
  items: [
    { value: "round", label: m.tool_tip_round(), icon: Circle },
    { value: "square", label: m.tool_tip_square(), icon: Square },
  ],
};

function pixelTool(id: string, title: string, icon: Tool["icon"], mode: "paint" | "erase") {
  return defineTool<PixelSettings>({
    id,
    title,
    icon,
    menu: TIP_MENU,
    needsColor: mode === "paint",
    defaults: { size: 1, opacity: 1, pixelPerfect: true, shape: "round" },
    fields: [
      {
        kind: "integer",
        key: "size",
        label: m.tool_size(),
        min: 1,
        max: MAX_PIXEL_SIZE,
        unit: "px",
      },
      { kind: "percent", key: "opacity", label: m.tool_opacity() },
      {
        kind: "toggle",
        key: "pixelPerfect",
        label: m.tool_pixel_perfect(),
        title: m.tool_pixel_perfect_title(),
      },
    ],
    cursor: (s) => ({
      kind: s.shape === "square" ? "square" : "pixel-round",
      size: s.size,
      opacity: mode === "paint" ? s.opacity : undefined,
    }),
    resize: (s, direction) => (s.size = Math.min(MAX_PIXEL_SIZE, Math.max(1, s.size + direction))),
    begin(context, { size, opacity, pixelPerfect, shape }) {
      const rounded = Math.max(1, Math.round(size));
      const raster = new StrokeRaster(context.editor.drawing, context.layer!.id, {
        color: context.color,
        opacity,
        mode,
        ...selectionClip(context.editor.selection.state),
      });
      const path = new PixelPathBuilder(pixelPerfect && rounded === 1);
      return new PixelStroke(raster, path, rounded, shape, title);
    },
  });
}

export const pixelBrushTool = pixelTool("pixel", m.tool_pixel_brush(), Pencil, "paint");
export const pixelEraserTool = pixelTool("pixelEraser", m.tool_pixel_eraser(), Eraser, "erase");

class PixelStroke implements ToolStroke {
  constructor(
    private readonly raster: StrokeRaster,
    private readonly path: PixelPathBuilder,
    private readonly size: number,
    private readonly shape: StampShape,
    private readonly label: string,
  ) {}

  move(s: Sample) {
    const { paint, unpaint } = this.path.add(s.x, s.y);
    this.raster.setPixels(unpaint, this.size, false, this.shape);
    this.raster.setPixels(paint, this.size, true, this.shape);
  }

  flush() {
    this.raster.flush();
  }

  finish() {
    return this.raster.finish(this.label);
  }

  cancel() {
    this.raster.cancel();
  }
}
