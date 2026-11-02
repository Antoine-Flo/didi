// The modes that come with Didi.

import { Grid3x3, Paintbrush } from "@lucide/svelte";
import { ModeRegistry, type Mode } from "./mode";

export const PIXEL_MODE: Mode = {
  id: "pixel",
  title: "Pixel art",
  icon: Grid3x3,
  tools: ["pixel", "pixelEraser", "picker"],
  eraserTool: "pixelEraser",
  panels: [],
  // Like Aseprite: B is the pencil, E the eraser.
  bindings: [
    { keys: "b", command: "tool.pixel" },
    { keys: "e", command: "tool.pixelEraser" },
  ],
};

export const PAINTING_MODE: Mode = {
  id: "painting",
  title: "Painting",
  icon: Paintbrush,
  tools: ["brush", "eraser", "picker"],
  eraserTool: "eraser",
  panels: ["brushes"],
  bindings: [],
};

export const BUILTIN_MODES = [PIXEL_MODE, PAINTING_MODE];

/** A registry with the built-in modes. */
export function createModeRegistry(): ModeRegistry {
  const registry = new ModeRegistry();
  for (const mode of BUILTIN_MODES) registry.register(mode);
  return registry;
}
