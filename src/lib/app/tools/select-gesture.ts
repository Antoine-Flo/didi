// The gestures of the selection tools (see select-tool.ts) on an existing selection: moving an
// edge, the center of rotation, or the content. Each is one undo step. The new selections' are
// in select-new-area.ts.

import { moveEdge, type Side } from "#lib/core/selection/handles.js";
import {
  centerOf,
  samePlacement,
  type Placement,
  type Point,
} from "#lib/core/selection/placement.js";
import {
  appliedState,
  changedTiles,
  layerTiles,
  placementOf,
  selectionEdit,
  type SelectionState,
} from "#lib/core/selection/selection.js";
import { lift, showFloating } from "#lib/core/selection/floating.js";
import { shapeMask } from "#lib/core/selection/shape.js";
import type { TileSnapshot } from "#lib/core/document/tiles.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { Rect } from "#lib/core/shared/geometry.js";
import type { Edit } from "#lib/core/history/edits.js";
import type { Sample, ToolContext, ToolStroke } from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

export const canvasOf = ({ drawing }: Editor): Rect => ({
  x: 0,
  y: 0,
  width: drawing.width,
  height: drawing.height,
});

const samePoint = (a: Point | null | undefined, b: Point | null | undefined) =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.x === b.x && a.y === b.y);

/** A gesture of the pen, from what the selection was when it went down. */
export abstract class Gesture implements ToolStroke {
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
    if (layerId) {
      this.tiles = { layerId, before: layerTiles(this.editor.drawing, layerId) };
    }
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
    if (this.tiles) {
      this.editor.drawing.restorePixels(this.tiles.layerId, this.tiles.before);
    }
    this.editor.selection.set(this.before);
  }
}

/** Moves one edge of the selection. The pixels stay where they are. */
export class MoveEdge extends Gesture {
  /** Null if it was only floating off the canvas: applying it leaves no selection. */
  private readonly start: Rect | null;

  constructor(
    context: ToolContext,
    sample: Sample,
    private readonly side: Side,
  ) {
    super(context, sample, m.tool_undo_selection_bounds());
    const { selection, drawing } = context.editor;
    selection.set(appliedState(drawing, selection.state));
    this.start = selection.rect;
  }

  protected update(pen: Sample) {
    if (!this.start) {
      return;
    }
    const horizontal = this.side === "e" || this.side === "w";
    const delta = Math.round(horizontal ? pen.x - this.grab.x : pen.y - this.grab.y);
    const rect = moveEdge(this.start, this.side, delta, canvasOf(this.editor));
    const { selection } = this.editor;
    if (samePlacement(rect, selection.rect)) {
      return;
    }
    selection.set({ ...selection.state, rect });
  }
}

/** Moves the center of rotation, to pixel corners and centers. No pixel changes. */
export class MovePivot extends Gesture {
  private readonly start: Point;

  constructor(context: ToolContext, sample: Sample) {
    super(context, sample, m.tool_undo_rotation_center());
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
    if (samePoint(pivot, selection.state.pivot)) {
      return;
    }
    // Grabbed without really moving: it stays the default one.
    if (this.grab.x === pen.x && this.grab.y === pen.y) {
      return;
    }
    selection.set({ ...selection.state, pivot });
  }
}

/** Where a gesture puts the content, from where it was when the pen went down. */
export type Place = (start: Placement, pen: Sample, grab: Sample) => Placement;

/** Moves, scales, rotates or skews the content, lifting it once the pen has really moved. */
export class TransformContent extends Gesture {
  private readonly start: Placement;
  private readonly startPivot: Point | null;

  constructor(
    context: ToolContext,
    sample: Sample,
    label: string,
    private readonly layerId: string,
    private readonly place: Place,
    /** Mixes original pixels, rather than keeping them exact (see showFloating). */
    private readonly smooth: boolean,
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
    if (samePlacement(next, shownAt)) {
      return;
    }
    const { shape } = selection.state;
    const floating =
      selection.floating ??
      lift(drawing, this.layerId, shownAt, shape ? shapeMask(shownAt, shape) : null);
    showFloating(drawing, floating, shownAt, next, this.smooth);
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
