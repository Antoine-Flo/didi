// The color picker.

import { Pipette } from "@lucide/svelte";
import { composite } from "#lib/core/document/compositing.js";
import { unpremultiply } from "#lib/core/document/pixels.js";
import { defineTool } from "./tool";

/** Picks the visible color under the pen. Transparent pixels are ignored. */
export const pickerTool = defineTool({
  id: "picker",
  title: "Color picker",
  icon: Pipette,
  defaults: {},
  hint: "Click on the canvas to pick a color.",
  needsLayer: false,
  cursor: () => ({ kind: "none" }),
  begin(context, _settings, { x, y }) {
    const { drawing } = context.editor;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= drawing.width || py >= drawing.height) return null;
    const [r, g, b, a] = unpremultiply(composite(drawing, { x: px, y: py, width: 1, height: 1 }));
    if (a > 0) context.pick([r, g, b]);
    return null;
  },
});
