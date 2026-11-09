// The paint bucket, like Aseprite's: fills the area of the clicked pixel's color on the
// active layer, exactly to the pixel (no anti-aliasing), as one undo step.

import { selectionClip } from "#lib/core/selection/selection.js";
import { PaintBucket } from "@lucide/svelte";
import { fillArea } from "#lib/core/brush/flood-fill.js";
import { StrokeRaster } from "#lib/core/brush/raster.js";
import { defineTool, type ToolStroke } from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

type FillSettings = {
  opacity: number;
  /** Largest difference allowed on each channel, 0 (exact color) to 255. */
  tolerance: number;
  /** Only the area connected to the clicked pixel, not every pixel of that color. */
  contiguous: boolean;
};

export const fillTool = defineTool<FillSettings>({
  id: "fill",
  title: m.tool_fill(),
  icon: PaintBucket,
  defaults: { opacity: 1, tolerance: 0, contiguous: true },
  fields: [
    { kind: "percent", key: "opacity", label: m.tool_opacity() },
    { kind: "integer", key: "tolerance", label: m.tool_tolerance(), min: 0, max: 255 },
    {
      kind: "toggle",
      key: "contiguous",
      label: m.tool_contiguous(),
      title: m.tool_contiguous_title(),
    },
  ],
  cursor: () => ({ kind: "none" }),
  begin(context, { opacity, tolerance, contiguous }, sample) {
    const { drawing } = context.editor;
    const layer = context.layer!;
    const { width, height } = drawing;
    const pixels = layer.tiles.readRegion({ x: 0, y: 0, width, height });
    const x = Math.floor(sample.x);
    const y = Math.floor(sample.y);
    const area = fillArea(pixels, width, height, x, y, { tolerance, contiguous });
    if (!area) {
      return null;
    }
    const raster = new StrokeRaster(drawing, layer.id, {
      color: context.color,
      opacity,
      mode: "paint",
      ...selectionClip(context.editor.selection.state),
    });
    raster.setArea(area.bounds, true, (px, py) => area.mask[py * width + px] === 1);
    return paintedStroke(raster, m.tool_fill());
  },
});

/** A stroke already painted when the pen goes down: its moves change nothing. */
function paintedStroke(raster: StrokeRaster, label: string): ToolStroke {
  return {
    busy: false,
    move() {},
    flush: () => raster.flush(),
    drain() {},
    finish: () => raster.finish(label),
    cancel: () => raster.cancel(),
  };
}
