// The color picker. What it can read from (`SOURCES`) and what it can take (`CHANNELS`) are
// tables: add an entry and it shows in the tool bar.

import { Pipette } from "@lucide/svelte";
import { composite } from "#lib/core/document/compositing.js";
import { unpremultiply } from "#lib/core/document/pixels.js";
import type { Rect } from "#lib/core/geometry.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { defineTool, type Picked, type ToolOptions } from "./tool";

interface Source {
  label: string;
  title: string;
  /** Premultiplied RGBA of `rect`, or null when there is nothing to read. */
  read(editor: Editor, rect: Rect): Uint8ClampedArray | null;
}

const SOURCES: Record<string, Source> = {
  canvas: {
    label: "Canvas",
    title: "Pick what is visible on the canvas",
    read: (editor, rect) => composite(editor.drawing, rect),
  },
  layer: {
    label: "Layer",
    title: "Pick from the active layer only",
    read: (editor, rect) => editor.activeLayer?.tiles.readRegion(rect) ?? null,
  },
};

interface Channels {
  label: string;
  title: string;
  color: boolean;
  opacity: boolean;
}

const CHANNELS: Record<string, Channels> = {
  both: {
    label: "Color + Opacity",
    title: "Take the color, and the opacity for your tool",
    color: true,
    opacity: true,
  },
  color: { label: "Color", title: "Take the color only", color: true, opacity: false },
  opacity: {
    label: "Opacity",
    title: "Take the opacity only, for your tool",
    color: false,
    opacity: true,
  },
};

const choices = <T extends { label: string; title: string }>(table: Record<string, T>) =>
  Object.entries(table).map(([value, { label, title }]) => ({ value, label, title }));

interface PickerSettings {
  [key: string]: string;
  source: string;
  channels: string;
}

/**
 * What a click takes at a point. Null outside the canvas. A transparent pixel has no color:
 * taking its color leaves none selected, and its opacity, 0, is taken only when asked alone.
 */
function pickAt(
  editor: Editor,
  { source, channels }: PickerSettings,
  x: number,
  y: number,
): Picked | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const { drawing } = editor;
  if (px < 0 || py < 0 || px >= drawing.width || py >= drawing.height) return null;
  const data = SOURCES[source]?.read(editor, { x: px, y: py, width: 1, height: 1 });
  const taken = CHANNELS[channels];
  if (!data || !taken) return null;
  const [r, g, b, a] = unpremultiply(data);
  if (a === 0) return taken.color ? { color: null } : { opacity: 0 };
  return {
    color: taken.color ? [r, g, b] : undefined,
    opacity: taken.opacity ? a / 255 : undefined,
  };
}

/** Picks under the pen. The tool bar's swatch shows the result of a click there. */
export const pickerTool = defineTool<PickerSettings>({
  id: "picker",
  title: "Color picker",
  icon: Pipette,
  defaults: { source: "canvas", channels: "both" },
  fields: [
    { kind: "choice", key: "source", label: "Pick from", choices: choices(SOURCES) },
    { kind: "choice", key: "channels", label: "Take", choices: choices(CHANNELS) },
  ],
  needsLayer: false,
  needsColor: false,
  cursor: () => ({ kind: "picker" }),
  preview(editor, settings, { x, y }, current) {
    const picked = pickAt(editor, settings, x, y);
    return {
      color: picked?.color === undefined ? current.color : picked.color,
      opacity: picked?.opacity ?? current.opacity,
    };
  },
  begin(context, settings, { x, y }) {
    const picked = pickAt(context.editor, settings, x, y);
    if (picked) context.pick(picked);
    return null;
  },
});

/** Applies what was picked: the opacity goes to the tool `toolId`, if it has one. */
export function applyPicked(options: ToolOptions, toolId: string, { color, opacity }: Picked) {
  if (color !== undefined) options.color = color;
  const settings = options.tools[toolId];
  if (opacity !== undefined && typeof settings?.opacity === "number") settings.opacity = opacity;
}
