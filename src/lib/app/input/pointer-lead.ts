// The pointer drawn by the view shows on screen a few frames after the pen got there: it is
// drawn a little ahead, where the pen is heading, to stay under it (see showPointer in
// CanvasView).

/** How far ahead the pointer is drawn, in milliseconds of the pen's movement. */
const PREDICT_MS = 30;
/** The pen's speed is averaged over about this long, in milliseconds. */
const VELOCITY_MS = 25;
/** At most this far ahead, in window pixels. */
const MAX_LEAD = 60;
/** Without a move for this long, the pen has stopped: the pointer goes back under it. */
const STILL_MS = 40;

/** A pointer position, in the window, and when it was there (event time). */
export interface PointerAt {
  clientX: number;
  clientY: number;
  time: number;
  pen: boolean;
}

export class PointerLead {
  /** The last pointer position. */
  private at: PointerAt | null = null;
  /** The pointer moved since it was last shown. */
  private moved = false;
  private velocity = { x: 0, y: 0 };

  move(at: PointerAt) {
    const last = this.at;
    if (last && at.time > last.time) {
      // Window pixels per millisecond, smoothed over about VELOCITY_MS.
      const dt = at.time - last.time;
      const vx = (at.clientX - last.clientX) / dt;
      const vy = (at.clientY - last.clientY) / dt;
      const k = 1 - Math.exp(-dt / VELOCITY_MS);
      const v = this.velocity;
      this.velocity = { x: v.x + (vx - v.x) * k, y: v.y + (vy - v.y) * k };
    }
    this.at = at;
    this.moved = true;
  }

  /** The pointer left the view. */
  leave() {
    this.at = null;
    this.velocity = { x: 0, y: 0 };
  }

  /**
   * For a frame at `now`: where the pointer is, and where to draw it, in the window. Null when
   * nothing changed since the last frame. Not ahead when the pen has stopped, nor for a mouse
   * (its moves are too irregular: it would shake), nor without `mayLead` (pixel-art tips: their
   * pixels are where the pen really is, under the system pointer).
   */
  frame(
    now: number,
    mayLead: boolean,
  ): { at: PointerAt; ahead: { clientX: number; clientY: number } } | null {
    const at = this.at;
    if (!at) {
      return null;
    }
    const still = now - at.time > STILL_MS;
    if (!this.moved && still) {
      if (this.velocity.x === 0 && this.velocity.y === 0) {
        return null;
      }
      this.velocity = { x: 0, y: 0 };
    }
    this.moved = false;
    let lead = { x: this.velocity.x * PREDICT_MS, y: this.velocity.y * PREDICT_MS };
    const length = Math.hypot(lead.x, lead.y);
    if (still || !at.pen || !mayLead) {
      lead = { x: 0, y: 0 };
    } else if (length > MAX_LEAD) {
      lead = { x: (lead.x * MAX_LEAD) / length, y: (lead.y * MAX_LEAD) / length };
    }
    return { at, ahead: { clientX: at.clientX + lead.x, clientY: at.clientY + lead.y } };
  }
}
