// The modes that come with Didi.

import { Grid3x3, Paintbrush } from "@lucide/svelte";
import { ModeRegistry, type Mode } from "./mode";

export const PIXEL_MODE: Mode = {
  id: "pixel",
  title: "Pixel art",
  icon: Grid3x3,
  description: "Sprites, tiles and animation, pixel by pixel.",
  newDocument: {
    presets: [
      { group: "Sprites and tiles", sizes: [16, 32, 64, 128, 256].map((s) => [s, s]) },
      {
        group: "Screen",
        sizes: [
          [160, 144],
          [320, 180],
          [480, 270],
          [640, 360],
        ],
      },
    ],
    size: { width: 64, height: 64 },
    background: "transparent",
  },
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
  description: "Illustrations, concept art and textures, with soft brushes.",
  newDocument: {
    presets: [
      { group: "Textures", sizes: [512, 1024, 2048, 4096].map((s) => [s, s]) },
      {
        group: "Screen",
        sizes: [
          [1280, 720],
          [1920, 1080],
          [2560, 1440],
          [3840, 2160],
        ],
      },
    ],
    size: { width: 2048, height: 2048 },
    background: "white",
  },
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
