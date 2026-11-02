// Drawing tools: what a tool is, and the registry that holds them.
//
// A tool is a definition: its title and icon, its settings (with the controls shown in the
// tool bar), the outline under the cursor, and what happens when the pen goes down. The
// painter (see $lib/app/canvas/painter) runs whichever tool is active, without knowing it.
// Built-in tools are registered like any other (see `builtin.ts`).

import type { Component } from "svelte";
import type { RGB } from "#lib/core/color/color.js";
import type { ReadonlyLayer } from "#lib/core/document/layer.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { Edit } from "#lib/core/history/edits.js";
import type { Brush, MyPaint } from "#lib/mypaint/engine.js";
import { Registry } from "#lib/app/registry.js";

export interface Sample {
  x: number;
  y: number;
  /** 0 to 1. Mice report 1. */
  pressure: number;
  /** Degrees, -90 to 90. */
  tiltX?: number;
  tiltY?: number;
  /** Milliseconds, any origin, increasing. */
  time?: number;
  /** View zoom and rotation (degrees) when the sample was taken. */
  viewZoom?: number;
  viewRotation?: number;
}

/** Brush outline under the cursor, in canvas pixels. */
export type BrushCursor =
  /** Soft brushes. */
  | { kind: "circle"; size: number }
  /** The exact pixels of a pixel-art tip. */
  | { kind: "square" | "pixel-round"; size: number }
  | { kind: "none" };

/** Settings of one tool: plain values, so they can be saved and shown in the tool bar. */
export type ToolSettings = Record<string, number | boolean | string>;

/** A control of the tool bar, changing one setting. */
export type ToolField =
  /** Diameter in canvas pixels, on a logarithmic slider (see `sizeFromSlider`). */
  | { kind: "size"; key: string; label: string }
  | { kind: "integer"; key: string; label: string; min: number; max: number; unit?: string }
  /** 0 to 1, shown as a percentage. */
  | { kind: "percent"; key: string; label: string }
  | { kind: "toggle"; key: string; label: string; title?: string };

/** Choices offered in a popup under the tool's button, e.g. the tip of a pixel brush. */
export interface ToolMenu {
  /** The setting they change. */
  key: string;
  items: {
    value: string;
    label: string;
    icon: Component<{ size?: number; fill?: string }>;
    /** The icon drawn filled, e.g. for a filled shape. */
    filledIcon?: boolean;
  }[];
}

/** Keys held while drawing, e.g. Shift to constrain a shape. */
export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** What a tool can use when the pen goes down. */
export interface ToolContext {
  readonly editor: Editor;
  /** The active layer, unlocked and visible. Null only for tools that need no layer. */
  readonly layer: ReadonlyLayer | null;
  /** Straight RGB, 0-255. */
  readonly color: RGB;
  /** The brush engine, once loaded. */
  readonly engine: MyPaint | null;
  /** The libmypaint brush for a bundled preset, created on first use. Needs the engine. */
  brush(preset: string): Brush;
  /** Clock for the frame budget, in milliseconds. */
  now(): number;
  /** The keys held now: they may change during the stroke (see ToolStroke.flush). */
  modifiers(): Modifiers;
  /** Makes `color` the current color. */
  pick(color: RGB): void;
  /** Tells the user why nothing happens. Returns null, for `begin`. */
  refuse(message: string): null;
}

/** A stroke in progress, from pen down to its undo step. */
export interface ToolStroke {
  /** Samples are waiting to be painted (see `flush`). */
  readonly busy: boolean;
  move(sample: Sample): void;
  /** Paints waiting samples for about `budgetMs`, then shows the latest changes. */
  flush(budgetMs: number): void;
  /** Paints every waiting sample now. */
  drain(): void;
  /** Ends the stroke, once nothing is waiting. Returns its undo step, if it changed anything. */
  finish(): Edit | null;
  /** Abandons the stroke, leaving the layer as it was. */
  cancel(): void;
}

export interface Tool<S extends ToolSettings = ToolSettings> {
  /** Unique, e.g. "pixel". Its command is `tool.<id>`. */
  readonly id: string;
  /** In English, e.g. "Pixel brush". Also the label of its undo steps. */
  readonly title: string;
  readonly icon: Component<{ size?: number }>;
  readonly defaults: S;
  /** Controls of the tool bar, in order. */
  readonly fields?: readonly ToolField[];
  /** Shown in the tool bar when there are no fields. */
  readonly hint?: string;
  /**
   * Id of the brush set it offers (see $lib/mypaint/brush-sets), in a popup next to its
   * button. Its settings then have a `preset`: the brush in use.
   */
  readonly brushSet?: string;
  /** Choices in a popup under its button, like the brushes of a brush set. */
  readonly menu?: ToolMenu;
  /** False for tools that work without an editable layer (e.g. the picker). */
  readonly needsLayer?: boolean;
  cursor(settings: S): BrushCursor;
  /** Grows (`direction` 1) or shrinks (-1) the tool, if it has a size. */
  resize?(settings: S, direction: 1 | -1): void;
  /** The pen goes down: starts a stroke, or does its job at once and returns null. */
  begin(context: ToolContext, settings: S, sample: Sample): ToolStroke | null;
}

/** A tool, typed for its settings when defined, stored without. */
export function defineTool<S extends ToolSettings>(tool: Tool<S>): Tool {
  return tool as unknown as Tool;
}

/** Current color and the settings of every tool, by tool id. */
export interface ToolOptions {
  /** Straight RGB, 0-255. */
  color: RGB;
  tools: Record<string, ToolSettings>;
}

export class ToolRegistry extends Registry<Tool> {
  constructor() {
    super("tool");
  }

  /** The default color and every tool's default settings. */
  defaultOptions(): ToolOptions {
    const tools: Record<string, ToolSettings> = {};
    for (const tool of this.list()) tools[tool.id] = { ...tool.defaults };
    return { color: [20, 20, 20], tools };
  }
}

export const MIN_SIZE = 0.5;
export const MAX_SIZE = 1000;

/**
 * Size sliders are logarithmic, so small sizes stay easy to set: slider position 0 to 1
 * maps to MIN_SIZE to MAX_SIZE.
 */
export function sizeFromSlider(position: number): number {
  const size = MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, position);
  return size < 10 ? Math.round(size * 10) / 10 : Math.round(size);
}

export function sliderFromSize(size: number): number {
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
  return Math.log(clamped / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE);
}

/** The next size up or down, by steps that feel even at every size. */
export function stepSize(size: number, direction: 1 | -1): number {
  // Through the slider mapping, which also rounds sensibly for small and large sizes.
  return sizeFromSlider(sliderFromSize(size * (direction > 0 ? 1.25 : 0.8)));
}
