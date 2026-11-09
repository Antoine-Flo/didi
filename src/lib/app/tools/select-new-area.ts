// The gestures of the selection tools (see select-tool.ts) making a new selection: by rectangle
// or lasso.

import { samePlacement, type Point } from "#lib/core/selection/placement.js";
import { pathSelection } from "#lib/core/selection/shape.js";
import { intersect } from "#lib/core/shared/geometry.js";
import type { Edit } from "#lib/core/history/edits.js";
import { canvasOf, Gesture } from "#lib/app/tools/select-gesture.js";
import type { Sample, ToolContext } from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

/**
 * Makes a new selection. While the pen is down, only what it would select shows: the selection
 * comes when it is lifted. A click just removes the current one.
 */
abstract class NewArea extends Gesture {
  private lifted = false;

  constructor(context: ToolContext, sample: Sample) {
    super(context, sample, m.tool_undo_select());
    context.editor.selection.set({ rect: null, floating: null });
  }

  /** Updates the draft. */
  protected abstract track(pen: Sample): void;

  protected update(pen: Sample) {
    if (!this.lifted) {
      this.track(pen);
    }
  }

  finish(): Edit | null {
    this.flush();
    this.lifted = true;
    const { selection } = this.editor;
    const { draft } = selection;
    selection.setDraft(null);
    if (draft) {
      selection.set({ ...draft, floating: null });
    }
    return super.finish();
  }

  cancel() {
    this.editor.selection.setDraft(null);
    super.cancel();
  }
}

/** Drags out a rectangle. */
export class NewRectangle extends NewArea {
  private readonly startX: number;
  private readonly startY: number;
  private moved = false;

  constructor(context: ToolContext, sample: Sample) {
    super(context, sample);
    this.startX = Math.floor(sample.x);
    this.startY = Math.floor(sample.y);
  }

  protected track(pen: Sample) {
    const x = Math.floor(pen.x);
    const y = Math.floor(pen.y);
    if (!this.moved && x === this.startX && y === this.startY) {
      return;
    }
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
    if (samePlacement(rect, selection.draft?.rect ?? null)) {
      return;
    }
    selection.setDraft(rect && { rect });
  }
}

/** Draws a shape freehand, closed by a straight line. */
export class NewLasso extends NewArea {
  /** The pixels the pen went through: their centers. */
  private readonly path: Point[] = [];
  private shown = 0;

  move(sample: Sample) {
    super.move(sample);
    const { width, height } = this.editor.drawing;
    const x = Math.min(width - 1, Math.max(0, Math.floor(sample.x))) + 0.5;
    const y = Math.min(height - 1, Math.max(0, Math.floor(sample.y))) + 0.5;
    const last = this.path.at(-1);
    if (!last || last.x !== x || last.y !== y) {
      this.path.push({ x, y });
    }
  }

  protected track() {
    if (this.path.length === this.shown) {
      return;
    }
    this.shown = this.path.length;
    this.editor.selection.setDraft(pathSelection(this.path));
  }
}
