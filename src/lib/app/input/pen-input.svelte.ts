// From pen events to strokes: when a stroke starts, goes on and ends, from DOM pointer events
// or from native pen events (Linux), and with which end of the pen. The view (CanvasView)
// turns events into samples and handles panning; the painter draws.
//
// When native pen events are available, they draw, and DOM pointer events only pan the view,
// except for fingers: they always come as DOM events (see touch-gestures.ts).

import type { Painter } from "#lib/app/input/painter.js";
import type { Sample } from "#lib/app/tools/tool.js";
import type { PenEvent } from "#lib/platform/pen.js";

/**
 * Some drivers switch the pen to its eraser (or back) with a barrel button: the system then
 * sees the pen lifted and the eraser put down at once. Within this delay, a lift followed by a
 * new contact is treated as the same stroke.
 */
export const DEVICE_SWITCH_MS = 50;

export interface PenInputHost {
  readonly painter: Pick<Painter, "active" | "begin" | "move" | "end" | "cancel">;
  /** A click that closes a menu only closes it (see dismissal.ts). Returns whether it did. */
  consumeDismissal(): boolean;
  /** Whether a native press there (window coordinates) may start a stroke: on the canvas. */
  mayStartAt(x: number, y: number): boolean;
  /** The drawing sample of a native event. */
  sample(e: PenEvent): Sample;
}

export class PenInput {
  /** A stroke is in progress. */
  stroking = $state(false);
  /** The pen's eraser end is near the tablet (hovering). */
  hoverEraser = $state(false);
  /** The eraser end started the stroke in progress. */
  strokeEraser = $state(false);

  /** Native pen events draw. */
  private native = false;
  /** The stroke in progress comes from DOM events, even with native ones (a finger). */
  private domStroke = false;
  /** Pending end of a native stroke, see `onNative`. */
  private pendingEnd: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: PenInputHost) {}

  /** Native pen events draw from now on. */
  useNative() {
    this.native = true;
  }

  /**
   * A DOM press with the tip or the eraser end. Returns whether a stroke started. `finger`:
   * fingers draw from DOM events even when the pen's are native.
   */
  domDown(sample: Sample, eraser: boolean, finger = false): boolean {
    if ((this.native && !finger) || this.stroking || this.host.consumeDismissal()) {
      return false;
    }
    this.stroking = this.host.painter.begin(sample, eraser);
    this.strokeEraser = eraser;
    this.domStroke = this.stroking;
    return this.stroking;
  }

  domMove(samples: readonly Sample[]) {
    if (this.stroking && this.domStroke) {
      this.host.painter.move(samples);
    }
  }

  domUp() {
    if (!this.stroking || !this.domStroke) {
      return;
    }
    this.host.painter.end();
    this.stroking = false;
    this.domStroke = false;
  }

  onNative(e: PenEvent) {
    if (e.source === "pen" || e.source === "eraser") {
      this.hoverEraser = e.source === "eraser";
    }
    // Fingers come as DOM events too: they are handled there. A finger is drawing: the pen waits.
    if (e.source === "touch" || this.domStroke) {
      return;
    }
    if (e.phase === "move") {
      if (!this.stroking) {
        return;
      }
      if (!e.pressed && this.pendingEnd === null) {
        // The tip is up but we missed its release (e.g. it happened in another window, like
        // the color dialog): end the stroke instead of drawing while hovering.
        this.end();
        return;
      }
      this.host.painter.move([this.host.sample(e)]);
      return;
    }
    if (e.button !== 1) {
      return;
    }
    if (e.phase === "down") {
      if (this.pendingEnd !== null) {
        // The pen switched device (pen ↔ eraser) without being lifted: same stroke, same tool
        // until the pen is really lifted.
        this.clearPendingEnd();
        return;
      }
      if (this.host.consumeDismissal()) {
        return;
      }
      if (!this.host.mayStartAt(e.x, e.y)) {
        return;
      }
      this.strokeEraser = e.source === "eraser";
      this.stroking = this.host.painter.begin(this.host.sample(e), this.strokeEraser);
    } else if (this.stroking && this.pendingEnd === null) {
      // Wait a little: a "down" right after means a device switch, not a lift.
      this.pendingEnd = setTimeout(() => this.end(), DEVICE_SWITCH_MS);
    }
  }

  /** Ends the stroke in progress, if any: the pen is up, or its release will not come. */
  end() {
    this.clearPendingEnd();
    if (this.stroking) {
      this.host.painter.end();
    }
    this.stroking = false;
    this.domStroke = false;
  }

  /**
   * Abandons the stroke in progress, also while a lifted stroke is still being painted.
   * Returns whether there was one.
   */
  cancel(): boolean {
    if (!this.stroking && !this.host.painter.active) {
      return false;
    }
    this.clearPendingEnd();
    this.host.painter.cancel();
    this.stroking = false;
    this.domStroke = false;
    return true;
  }

  private clearPendingEnd() {
    if (this.pendingEnd !== null) {
      clearTimeout(this.pendingEnd);
    }
    this.pendingEnd = null;
  }
}
