// Undo / redo.
//
// Edits are applied when pushed. Consecutive edits can be grouped into one step with
// `begin` / `end` (e.g. while dragging a slider, or for a plugin macro). The oldest steps
// are dropped when the history exceeds its step or memory limits.

import type { Drawing } from "#lib/core/document/drawing.js";
import { group, type Edit } from "#lib/core/history/edits.js";
import { Emitter } from "#lib/core/shared/emitter.js";

export interface HistoryOptions {
  /** Maximum number of undo steps. */
  maxSteps?: number;
  /** Approximate memory budget for undo and redo steps, in bytes. */
  maxBytes?: number;
}

const DEFAULTS: Required<HistoryOptions> = {
  maxSteps: 500,
  maxBytes: 512 * 1024 * 1024,
};

interface OpenGroup {
  label: string;
  edits: Edit[];
  depth: number;
}

export class History {
  private past: Edit[] = [];
  private future: Edit[] = [];
  private open: OpenGroup | null = null;
  private changes = new Emitter<void>();
  private readonly options: Required<HistoryOptions>;

  constructor(
    private readonly drawing: Drawing,
    options: HistoryOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  get canUndo(): boolean {
    return this.past.length > 0 || (this.open?.edits.length ?? 0) > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    if (this.open?.edits.length) {
      return this.open.label;
    }
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  /** Number of undo steps. */
  get steps(): number {
    return this.past.length;
  }

  /**
   * Identifies the current state of the drawing, as reached through the history: compare
   * it with the marker saved with a file to know whether there are unsaved changes. Undoing
   * back to the saved state gives the same marker again. Edits outside the drawing do not
   * change it.
   */
  get marker(): unknown {
    return this.past.findLast((edit) => !edit.outsideDrawing) ?? null;
  }

  /** Approximate memory kept by undo and redo steps, in bytes. */
  get bytes(): number {
    return [...this.past, ...this.future].reduce((sum, e) => sum + (e.bytes?.() ?? 0), 0);
  }

  /** Applies an edit and records it. If applying throws, nothing is recorded. */
  push(edit: Edit) {
    edit.apply(this.drawing);
    if (this.open) {
      this.open.edits.push(edit);
    } else {
      this.record(edit);
    }
    this.notify();
  }

  /** Starts grouping edits into one step. Groups can be nested; the outermost wins. */
  begin(label: string) {
    if (this.open) {
      this.open.depth++;
    } else {
      this.open = { label, edits: [], depth: 1 };
    }
  }

  /** Ends the current group. An empty group leaves no step. */
  end() {
    if (!this.open) {
      throw new Error("No group to end");
    }
    if (--this.open.depth > 0) {
      return;
    }
    const { label, edits } = this.open;
    this.open = null;
    if (edits.length > 0) {
      this.record(group(label, edits));
    }
    this.notify();
  }

  /** Undoes the last step. Closes any open group first. Returns false if there is nothing to undo. */
  undo(): boolean {
    this.closeGroup();
    const edit = this.past.pop();
    if (!edit) {
      return false;
    }
    edit.revert(this.drawing);
    this.future.push(edit);
    this.notify();
    return true;
  }

  /** Redoes the last undone step. Returns false if there is nothing to redo. */
  redo(): boolean {
    this.closeGroup();
    const edit = this.future.pop();
    if (!edit) {
      return false;
    }
    edit.apply(this.drawing);
    this.past.push(edit);
    this.notify();
    return true;
  }

  /** Forgets all steps, without changing the drawing. */
  clear() {
    this.past = [];
    this.future = [];
    this.open = null;
    this.notify();
  }

  /** Calls `listener` after every change. Returns a function that unsubscribes. */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }

  private record(edit: Edit) {
    this.past.push(edit);
    this.future = [];
    this.enforceLimits();
  }

  private closeGroup() {
    if (!this.open) {
      return;
    }
    this.open.depth = 1;
    this.end();
  }

  // Drops the oldest steps, but always keeps the most recent one.
  private enforceLimits() {
    const { maxSteps, maxBytes } = this.options;
    while (this.past.length > Math.max(1, maxSteps)) {
      this.past.shift();
    }
    let bytes = this.bytes;
    while (this.past.length > 1 && bytes > maxBytes) {
      bytes -= this.past.shift()!.bytes?.() ?? 0;
    }
  }

  private notify() {
    this.changes.emit();
  }
}
