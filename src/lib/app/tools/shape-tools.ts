// Pixel art shapes, like Aseprite's: line, rectangle and ellipse. Drag from one pixel to
// another; the shape follows the pen until it is lifted. While dragging, only its outline
// is shown, drawn once per frame; a filled shape is filled on release. Shift keeps
// pixel-art line angles, squares and circles; Ctrl draws from the center. The outline is
// as thick as the size, with a square tip, like the cursor.

import { Circle, Slash, Square } from "@lucide/svelte";
import { StrokeRaster } from "#lib/core/brush/raster.js";
import type { Pixel } from "#lib/core/brush/pixel-path.js";
import {
  ellipseOutline,
  ellipseSpans,
  linePixels,
  rectOutline,
  shapeBox,
  snapLineEnd,
  type PixelBox,
} from "#lib/core/brush/shapes.js";
import type { Rect } from "#lib/core/geometry.js";
import { MAX_PIXEL_SIZE } from "./pixel-tools";
import {
  defineTool,
  type Modifiers,
  type Sample,
  type Tool,
  type ToolContext,
  type ToolField,
  type ToolMenu,
  type ToolStroke,
} from "./tool";

type ShapeSettings = {
  /** Outline thickness, in whole pixels. */
  size: number;
  opacity: number;
  /** Rectangles and ellipses only, chosen in the popup under the tool's button. */
  style: "outline" | "filled";
};

/** What a shape tool draws between the first pixel and the current one. */
type ShapeKind = "line" | "rectangle" | "ellipse";

const SIZE: ToolField = {
  kind: "integer",
  key: "size",
  label: "Size",
  min: 1,
  max: MAX_PIXEL_SIZE,
  unit: "px",
};
const OPACITY: ToolField = { kind: "percent", key: "opacity", label: "Opacity" };
/** Outline or filled, in the popup under the tool's button (like the pencil's tip). */
const styleMenu = (icon: Tool["icon"]): ToolMenu => ({
  key: "style",
  items: [
    { value: "outline", label: "Outline", icon },
    { value: "filled", label: "Filled", icon, filledIcon: true },
  ],
});

function shapeTool(id: string, title: string, icon: Tool["icon"], kind: ShapeKind): Tool {
  return defineTool<ShapeSettings>({
    id,
    title,
    icon,
    menu: kind === "line" ? undefined : styleMenu(icon),
    defaults: { size: 1, opacity: 1, style: "outline" },
    fields: [SIZE, OPACITY],
    cursor: (s) => ({ kind: "square", size: s.size }),
    resize: (s, direction) => (s.size = Math.min(MAX_PIXEL_SIZE, Math.max(1, s.size + direction))),
    begin(context, settings, sample) {
      const raster = new StrokeRaster(context.editor.drawing, context.layer!.id, {
        color: context.color,
        opacity: settings.opacity,
        mode: "paint",
      });
      return new ShapeStroke(context, raster, kind, settings, pixelOf(sample), title);
    },
  });
}

export const lineTool = shapeTool("line", "Line", Slash, "line");
export const rectangleTool = shapeTool("rectangle", "Rectangle", Square, "rectangle");
export const ellipseTool = shapeTool("ellipse", "Ellipse", Circle, "ellipse");

const pixelOf = (s: Sample): Pixel => ({ x: Math.floor(s.x), y: Math.floor(s.y) });

class ShapeStroke implements ToolStroke {
  readonly busy = false;
  private readonly size: number;
  private end: Pixel;
  /** What the shape was last drawn with, to redraw only on a change. */
  private drawn: { end: Pixel; keys: Modifiers } | null = null;
  /** The outline drawn last, to clear just those pixels before drawing the next one. */
  private outline: Pixel[] = [];

  constructor(
    private readonly context: ToolContext,
    private readonly raster: StrokeRaster,
    private readonly kind: ShapeKind,
    private readonly settings: ShapeSettings,
    private readonly start: Pixel,
    private readonly label: string,
  ) {
    this.size = Math.max(1, Math.round(settings.size));
    this.end = start;
  }

  /** Only remembers where the pen is: the shape is drawn once per frame, in `flush`. */
  move(s: Sample) {
    this.end = pixelOf(s);
  }

  /** Also redraws when Shift or Ctrl changes, without moving the pen. */
  flush() {
    this.preview();
    this.raster.flush();
  }

  drain() {}

  /** The final shape, filled if asked: while dragging, only its outline is shown. */
  finish() {
    const { box, outline } = this.shape(this.context.modifiers());
    this.clear();
    if (this.kind !== "line" && this.settings.style === "filled") {
      const area = rectOf(box);
      if (this.kind === "rectangle") this.raster.setArea(area, true);
      else {
        const spans = ellipseSpans(box);
        this.raster.setArea(area, true, (x, y) => {
          const span = spans.get(y);
          return span !== undefined && x >= span.x0 && x <= span.x1;
        });
      }
    } else {
      this.raster.setPixels(outline, this.size, true, "square");
    }
    return this.raster.finish(this.label);
  }

  cancel() {
    this.raster.cancel();
  }

  /** Draws the shape's outline, if the pen or the keys changed since the last time. */
  private preview() {
    const keys = this.context.modifiers();
    const last = this.drawn;
    if (
      last &&
      last.end.x === this.end.x &&
      last.end.y === this.end.y &&
      last.keys.shift === keys.shift &&
      last.keys.ctrl === keys.ctrl
    ) {
      return;
    }
    this.drawn = { end: this.end, keys: { ...keys } };
    const { outline } = this.shape(keys);
    this.clear();
    this.raster.setPixels(outline, this.size, true, "square");
    this.outline = outline;
  }

  /** Removes the outline drawn last. */
  private clear() {
    this.raster.setPixels(this.outline, this.size, false, "square");
    this.outline = [];
  }

  /** The shape for the current pen position and keys: its box and outline. */
  private shape(keys: Modifiers): { box: PixelBox; outline: Pixel[] } {
    if (this.kind === "line") {
      const end = keys.shift ? snapLineEnd(this.start, this.end) : this.end;
      return { box: boxOf(this.start, end), outline: linePixels(this.start, end) };
    }
    const box = shapeBox(this.start, this.end, { square: keys.shift, fromCenter: keys.ctrl });
    return { box, outline: this.kind === "rectangle" ? rectOutline(box) : ellipseOutline(box) };
  }
}

function boxOf(a: Pixel, b: Pixel): PixelBox {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

function rectOf({ x0, y0, x1, y1 }: PixelBox): Rect {
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
