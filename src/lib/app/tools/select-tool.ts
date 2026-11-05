// The selection (see $lib/core/selection), by rectangle or lasso, chosen in the popup under its
// button; once made, the two work the same. What the pen does depends on where it
// goes down. Outside: a new selection, or none with a simple click. On a bounds handle: moves
// an edge. On the cross: moves the center of rotation. Inside: moves the content. On the outer
// handles: scales, rotates or skews it. Content stays floating until it is applied, and every
// gesture is one undo step.

import { Lasso, SquareDashed } from "@lucide/svelte";
import { moveEdge, scaled, zoneAt, zoneCursor, type Side } from "#lib/core/selection/handles.js";
import {
  boxDelta,
  centerOf,
  moved,
  rotated,
  samePlacement,
  skewed,
  type Placement,
  type Point,
} from "#lib/core/selection/placement.js";
import {
  appliedState,
  changedTiles,
  layerTiles,
  lift,
  placementOf,
  selectionEdit,
  showFloating,
  type SelectionState,
} from "#lib/core/selection/selection.js";
import { shapeFrom, shapeMask } from "#lib/core/selection/shape.js";
import type { TileSnapshot } from "#lib/core/document/tiles.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { intersect, type Rect } from "#lib/core/geometry.js";
import type { Edit } from "#lib/core/history/edits.js";
import { defineTool, type Sample, type ToolContext, type ToolStroke } from "./tool";

const SNAP_ANGLE = Math.PI / 12;

const canvasOf = ({ drawing }: Editor): Rect => ({
  x: 0,
  y: 0,
  width: drawing.width,
  height: drawing.height,
});

const samePoint = (a: Point | null | undefined, b: Point | null | undefined) =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.x === b.x && a.y === b.y);

/** A gesture of the pen, from what the selection was when it went down. */
abstract class Gesture implements ToolStroke {
  readonly busy = false;
  protected readonly editor: Editor;
  private readonly before: SelectionState;
  protected readonly grab: Sample;
  private pen: Sample;
  /** The layer whose pixels change, and its tiles before the gesture. */
  private tiles: { layerId: string; before: TileSnapshot } | null = null;

  constructor(
    protected readonly context: ToolContext,
    sample: Sample,
    private readonly label: string,
    layerId?: string,
  ) {
    this.editor = context.editor;
    this.before = this.editor.selection.state;
    this.grab = this.pen = sample;
    if (layerId) this.tiles = { layerId, before: layerTiles(this.editor.drawing, layerId) };
  }

  /** Follows the pen. */
  protected abstract update(pen: Sample): void;

  move(sample: Sample) {
    this.pen = sample;
  }

  /** Also follows Shift, without the pen moving. */
  flush() {
    this.update(this.pen);
  }

  drain() {}

  finish(): Edit | null {
    this.update(this.pen);
    const { selection, drawing } = this.editor;
    const after = selection.state;
    const before = this.before;
    if (
      after.floating === before.floating &&
      samePoint(after.pivot, before.pivot) &&
      (after.shape ?? null) === (before.shape ?? null) &&
      samePlacement(placementOf(after), placementOf(before))
    ) {
      return null;
    }
    const pixels =
      this.tiles &&
      changedTiles(this.tiles.layerId, this.tiles.before, layerTiles(drawing, this.tiles.layerId));
    return selectionEdit(selection, this.label, before, after, pixels ?? undefined);
  }

  cancel() {
    if (this.tiles) this.editor.drawing.restorePixels(this.tiles.layerId, this.tiles.before);
    this.editor.selection.set(this.before);
  }
}

/** Drags out a new selection. A click just removes the current one. */
class NewSelection extends Gesture {
  private readonly startX: number;
  private readonly startY: number;
  private moved = false;

  constructor(context: ToolContext, sample: Sample) {
    super(context, sample, "Select");
    this.startX = Math.floor(sample.x);
    this.startY = Math.floor(sample.y);
    context.editor.selection.set({ rect: null, floating: null });
  }

  protected update(pen: Sample) {
    const x = Math.floor(pen.x);
    const y = Math.floor(pen.y);
    if (!this.moved && x === this.startX && y === this.startY) return;
    this.moved = true;
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    const box = {
      x: left,
      y: top,
      width: Math.max(x, this.startX) - left + 1,
      height: Math.max(y, this.startY) - top + 1,
    };
    const rect = intersect(box, canvasOf(this.editor));
    const { selection } = this.editor;
    if (!samePlacement(rect, selection.rect)) selection.set({ rect, floating: null });
  }
}

/** Draws a new selection freehand, closed by a straight line. A click removes the current one. */
class NewLasso extends Gesture {
  /** The pixels the pen went through: their centers. */
  private readonly path: Point[] = [];
  private shown = 0;

  constructor(context: ToolContext, sample: Sample) {
    super(context, sample, "Select");
    context.editor.selection.set({ rect: null, floating: null });
  }

  move(sample: Sample) {
    super.move(sample);
    const { width, height } = this.editor.drawing;
    const x = Math.min(width - 1, Math.max(0, Math.floor(sample.x))) + 0.5;
    const y = Math.min(height - 1, Math.max(0, Math.floor(sample.y))) + 0.5;
    const last = this.path.at(-1);
    if (!last || last.x !== x || last.y !== y) this.path.push({ x, y });
  }

  /** While the pen is down, only the line shows: the selection comes when it is lifted. */
  protected update() {
    if (this.path.length === this.shown) return;
    this.shown = this.path.length;
    this.editor.selection.setDraft([...this.path]);
  }

  finish(): Edit | null {
    const { selection } = this.editor;
    this.shown = this.path.length;
    selection.setDraft(null);
    if (this.path.length >= 2) {
      const xs = this.path.map((p) => p.x);
      const ys = this.path.map((p) => p.y);
      const left = Math.floor(Math.min(...xs));
      const top = Math.floor(Math.min(...ys));
      const rect = {
        x: left,
        y: top,
        width: Math.ceil(Math.max(...xs)) - left,
        height: Math.ceil(Math.max(...ys)) - top,
      };
      selection.set({ rect, shape: shapeFrom(this.path, rect), floating: null });
    }
    return super.finish();
  }

  cancel() {
    this.editor.selection.setDraft(null);
    super.cancel();
  }
}

/** Moves one edge of the selection. The pixels stay where they are. */
class MoveEdge extends Gesture {
  /** Null if it was only floating off the canvas: applying it leaves no selection. */
  private readonly start: Rect | null;

  constructor(
    context: ToolContext,
    sample: Sample,
    private readonly side: Side,
  ) {
    super(context, sample, "Selection bounds");
    const { selection, drawing } = context.editor;
    selection.set(appliedState(drawing, selection.state));
    this.start = selection.rect;
  }

  protected update(pen: Sample) {
    if (!this.start) return;
    const horizontal = this.side === "e" || this.side === "w";
    const delta = Math.round(horizontal ? pen.x - this.grab.x : pen.y - this.grab.y);
    const rect = moveEdge(this.start, this.side, delta, canvasOf(this.editor));
    const { selection } = this.editor;
    if (samePlacement(rect, selection.rect)) return;
    selection.set({ ...selection.state, rect });
  }
}

/** Moves the center of rotation, to pixel corners and centers. No pixel changes. */
class MovePivot extends Gesture {
  private readonly start: Point;

  constructor(context: ToolContext, sample: Sample) {
    super(context, sample, "Rotation center");
    const { state } = context.editor.selection;
    this.start = state.pivot ?? centerOf(placementOf(state)!);
  }

  protected update(pen: Sample) {
    const snap = (v: number) => Math.round(v * 2) / 2;
    const pivot = {
      x: snap(this.start.x + pen.x - this.grab.x),
      y: snap(this.start.y + pen.y - this.grab.y),
    };
    const { selection } = this.editor;
    if (samePoint(pivot, selection.state.pivot)) return;
    // Grabbed without really moving: it stays the default one.
    if (this.grab.x === pen.x && this.grab.y === pen.y) return;
    selection.set({ ...selection.state, pivot });
  }
}

/** Where a gesture puts the content, from where it was when the pen went down. */
type Place = (start: Placement, pen: Sample, grab: Sample) => Placement;

/** Moves, scales, rotates or skews the content, lifting it once the pen has really moved. */
class TransformContent extends Gesture {
  private readonly start: Placement;
  private readonly startPivot: Point | null;

  constructor(
    context: ToolContext,
    sample: Sample,
    label: string,
    private readonly layerId: string,
    private readonly place: Place,
    /** The center of rotation follows the content. */
    private readonly carriesPivot = false,
  ) {
    super(context, sample, label, layerId);
    const { state } = context.editor.selection;
    this.start = placementOf(state)!;
    this.startPivot = state.pivot ?? null;
  }

  protected update(pen: Sample) {
    const { selection, drawing } = this.editor;
    const shownAt = placementOf(selection.state)!;
    const next = this.place(this.start, pen, this.grab);
    if (samePlacement(next, shownAt)) return;
    const { shape } = selection.state;
    const floating =
      selection.floating ??
      lift(drawing, this.layerId, shownAt, shape ? shapeMask(shownAt, shape) : null);
    showFloating(drawing, floating, shownAt, next);
    const { transform, x, y, width, height } = next;
    let pivot = this.startPivot;
    if (pivot && this.carriesPivot) {
      pivot = {
        x: pivot.x + Math.round(pen.x - this.grab.x),
        y: pivot.y + Math.round(pen.y - this.grab.y),
      };
    }
    selection.set({ rect: { x, y, width, height }, transform, shape, floating, pivot });
  }
}

/** The layer content can be taken from, or null after telling the user why not. */
function contentLayer(context: ToolContext): string | null {
  const { selection, activeLayer: layer } = context.editor;
  if (selection.floating) return selection.floating.layerId;
  if (!layer) return context.refuse("No layer: add one to move pixels.");
  if (layer.locked) return context.refuse(`Layer "${layer.name}" is locked.`);
  if (!layer.visible) return context.refuse(`Layer "${layer.name}" is hidden.`);
  return layer.id;
}

type SelectSettings = {
  /** How a new selection is made. */
  shape: "rectangle" | "lasso";
};

export const selectTool = defineTool<SelectSettings>({
  id: "select",
  title: "Selection",
  icon: SquareDashed,
  defaults: { shape: "rectangle" },
  menu: {
    key: "shape",
    iconFollowsChoice: true,
    items: [
      { value: "rectangle", label: "Rectangle", icon: SquareDashed },
      { value: "lasso", label: "Lasso", icon: Lasso },
    ],
  },
  hint: "Drag to select. Enter applies, Esc cancels.",
  needsLayer: false,
  needsColor: false,
  cursor: () => ({ kind: "none" }),
  hover(editor, { x, y }, zoom) {
    const { state } = editor.selection;
    const placement = placementOf(state);
    if (!placement) return null;
    return zoneCursor(zoneAt(placement, x, y, zoom, state.pivot ?? null), placement);
  },
  begin(context, settings, sample) {
    const { state } = context.editor.selection;
    const placement = placementOf(state);
    const zone = placement
      ? zoneAt(placement, sample.x, sample.y, sample.viewZoom ?? 1, state.pivot ?? null)
      : ({ kind: "outside" } as const);
    if (zone.kind === "outside") {
      return settings.shape === "lasso"
        ? new NewLasso(context, sample)
        : new NewSelection(context, sample);
    }
    if (zone.kind === "bounds") return new MoveEdge(context, sample, zone.side);
    if (zone.kind === "pivot") return new MovePivot(context, sample);

    const layerId = contentLayer(context);
    if (!layerId) return null;
    const transform = (label: string, place: Place, carriesPivot = false) =>
      new TransformContent(context, sample, label, layerId, place, carriesPivot);

    switch (zone.kind) {
      case "inside":
        return transform(
          "Move",
          (start, pen, grab) =>
            moved(start, Math.round(pen.x - grab.x), Math.round(pen.y - grab.y)),
          true,
        );
      case "content":
        return transform("Scale", (start, pen, grab) => {
          const delta = boxDelta(start, pen.x - grab.x, pen.y - grab.y);
          const shift = context.modifiers().shift;
          return scaled(start, zone.id, delta.x, delta.y, shift);
        });
      case "rotate": {
        const center = state.pivot ?? centerOf(placement!);
        return transform("Rotate", (start, pen, grab) => {
          const from = Math.atan2(grab.y - center.y, grab.x - center.x);
          let angle = Math.atan2(pen.y - center.y, pen.x - center.x) - from;
          if (context.modifiers().shift) angle = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
          return angle === 0 ? start : rotated(start, center, angle);
        });
      }
      case "skew":
        return transform("Skew", (start, pen, grab) => {
          const dx = pen.x - grab.x;
          const dy = pen.y - grab.y;
          return dx === 0 && dy === 0 ? start : skewed(start, zone.side, dx, dy);
        });
    }
  },
});
