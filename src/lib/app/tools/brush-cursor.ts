import type { BrushCursor } from "#lib/app/tools/tool.js";
import type { RGB } from "#lib/core/color/color.js";
import type { Point } from "#lib/render/camera.js";
import type { BrushCursorState } from "#lib/render/brush-cursor.js";

/**
 * The outline the view draws for a tool's cursor at `p` (canvas pixels). Pixel-art tips show
 * their pixels in the color drawn with. Null: the view draws none.
 */
export function brushCursorState(
  c: BrushCursor,
  p: Point,
  brushColor: RGB | null,
): BrushCursorState | null {
  if (c.kind === "circle") {
    return { ...c, x: p.x, y: p.y };
  }
  if (c.kind === "square" || c.kind === "pixel-round") {
    const fill =
      c.opacity !== undefined && brushColor
        ? {
            color: (brushColor[0] << 16) | (brushColor[1] << 8) | brushColor[2],
            alpha: c.opacity,
          }
        : undefined;
    return { kind: c.kind, size: c.size, x: p.x, y: p.y, fill };
  }
  if (c.kind === "picker") {
    return { kind: "picker", x: p.x, y: p.y };
  }
  return null;
}
