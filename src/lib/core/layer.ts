import { TileStore } from "./tiles";

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "add",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

/** Layer settings that can be changed without touching pixels. */
export interface LayerProps {
  name: string;
  visible: boolean;
  /** 0 to 1. */
  opacity: number;
  blendMode: BlendMode;
  /** A locked layer refuses pixel changes. */
  locked: boolean;
}

export interface Layer extends LayerProps {
  /** Stable identifier, unique within the drawing. */
  readonly id: string;
  readonly tiles: TileStore;
}

export const LAYER_PROP_KEYS: readonly (keyof LayerProps)[] = [
  "name",
  "visible",
  "opacity",
  "blendMode",
  "locked",
];

export const DEFAULT_LAYER_PROPS: LayerProps = {
  name: "Calque",
  visible: true,
  opacity: 1,
  blendMode: "normal",
  locked: false,
};

/** Throws if some props are invalid. */
export function validateLayerProps(props: Partial<LayerProps>) {
  if (props.name !== undefined && props.name.trim() === "") {
    throw new RangeError("Layer name must not be empty");
  }
  if (props.opacity !== undefined && !(props.opacity >= 0 && props.opacity <= 1)) {
    throw new RangeError(`Opacity must be between 0 and 1, got ${props.opacity}`);
  }
  if (props.blendMode !== undefined && !BLEND_MODES.includes(props.blendMode)) {
    throw new RangeError(`Unknown blend mode ${props.blendMode}`);
  }
}
