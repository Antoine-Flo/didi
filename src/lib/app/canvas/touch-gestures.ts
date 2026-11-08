// Fingers on a touch screen, like in most drawing apps (Procreate, Krita…): two fingers move
// and zoom the view (and turn it, where the mode allows), a two-finger tap undoes, a
// three-finger tap redoes. One finger draws until a pen has been seen; then it moves the view,
// and the pen draws.
//
// A finger that starts drawing draws at once, for no delay. If a second finger lands soon
// after, it was the start of a gesture: the stroke is abandoned. Later, the stroke is kept.
//
// Pure logic: the view gives finger events (in view pixels, with their time) and gets camera
// changes, strokes and commands back, so it can be tested on its own.

import { pan, rotateAt, zoomAt, type Camera, type Point } from "#lib/render/camera.js";

/** A finger moving less than this, in view pixels, has not moved: it may be a tap. */
export const TAP_SLOP = 10;
/** A tap lasts at most this, in milliseconds, from the first finger down to the last up. */
export const TAP_MS = 300;
/** A second finger this soon after a stroke started abandons the stroke: a gesture began. */
export const GESTURE_GRACE_MS = 250;
/**
 * Fingers must turn this much (radians, about 10°) before the view turns: zooming barely
 * turns them, and must not turn the view.
 */
export const ROTATE_START = Math.PI / 18;

export interface TouchGestureHost {
  camera(): Camera;
  setCamera(camera: Camera): void;
  /** One finger draws (no pen seen yet). */
  fingerDraws(): boolean;
  /** Two fingers may turn the view. */
  mayRotate(): boolean;
  /** Starts a stroke at `p`. Returns whether it started. */
  beginStroke(p: Point, time: number): boolean;
  moveStroke(p: Point, time: number): void;
  endStroke(): void;
  cancelStroke(): void;
  undo(): void;
  redo(): void;
}

interface Finger {
  start: Point;
  at: Point;
}

/**
 * - pending: fingers down, nothing done yet: a tap, or a gesture once a finger moves.
 * - stroke: one finger draws.
 * - navigate: the fingers move the view.
 * - spent: the gesture is over (stroke ended, too many fingers…): nothing until all are up.
 */
type Phase = "idle" | "pending" | "stroke" | "navigate" | "spent";

export class TouchGestures {
  private readonly fingers = new Map<number, Finger>();
  private phase: Phase = "idle";
  /** The most fingers down at once, since the first went down. */
  private most = 0;
  private firstDown = 0;
  private strokeFinger: number | null = null;
  private strokeStart = 0;
  /** The view and the fingers when navigation started or the fingers changed. */
  private anchor: { camera: Camera; points: Point[]; turnedFrom: number } | null = null;
  /** The view turns with the fingers: they turned enough, since the first went down. */
  private rotating = false;

  constructor(private readonly host: TouchGestureHost) {}

  /** Fingers move the view: the brush's pointer is hidden meanwhile. */
  get navigating(): boolean {
    return this.phase === "navigate";
  }

  /** A finger is drawing. */
  get stroking(): boolean {
    return this.phase === "stroke";
  }

  down(id: number, p: Point, time: number) {
    if (this.fingers.size === 0) {
      this.phase = "pending";
      this.most = 0;
      this.firstDown = time;
      this.rotating = false;
    }
    this.fingers.set(id, { start: p, at: p });
    this.most = Math.max(this.most, this.fingers.size);

    if (this.phase === "stroke") {
      this.strokeFinger = null;
      if (time - this.strokeStart <= GESTURE_GRACE_MS) {
        // The stroke was the start of a gesture.
        this.host.cancelStroke();
        this.phase = "pending";
      } else {
        // A real stroke: kept, and the fingers now move the view.
        this.host.endStroke();
        this.navigate();
      }
      return;
    }
    if (this.phase === "navigate") this.reanchor();
    else if (this.phase === "pending" && this.fingers.size === 1 && this.host.fingerDraws()) {
      if (this.host.beginStroke(p, time)) {
        this.phase = "stroke";
        this.strokeFinger = id;
        this.strokeStart = time;
      }
    }
  }

  move(id: number, p: Point, time: number) {
    const finger = this.fingers.get(id);
    if (!finger) return;
    finger.at = p;
    if (this.phase === "stroke") {
      if (id === this.strokeFinger) this.host.moveStroke(p, time);
    } else if (this.phase === "pending") {
      if (Math.hypot(p.x - finger.start.x, p.y - finger.start.y) > TAP_SLOP) {
        // From where the fingers landed: the canvas stays under them.
        this.phase = "navigate";
        this.reanchor("start");
        this.follow();
      }
    } else if (this.phase === "navigate") {
      this.follow();
    }
  }

  up(id: number, time: number) {
    if (!this.fingers.delete(id)) return;
    if (this.phase === "stroke") {
      this.host.endStroke();
      this.strokeFinger = null;
      this.phase = "spent";
    } else if (this.phase === "navigate") {
      this.reanchor();
    } else if (this.phase === "pending" && this.fingers.size === 0) {
      // Still pending: no finger moved.
      if (time - this.firstDown <= TAP_MS) {
        if (this.most === 2) this.host.undo();
        else if (this.most === 3) this.host.redo();
      }
    }
    if (this.fingers.size === 0) {
      this.phase = "idle";
      this.anchor = null;
    }
  }

  /**
   * The pen came down: the fingers on the screen are the hand resting, not a gesture. They do
   * nothing more until lifted; a finger's stroke is kept.
   */
  abandon() {
    if (this.phase === "stroke") this.host.endStroke();
    if (this.phase !== "idle") this.phase = "spent";
    this.strokeFinger = null;
  }

  /** The system took the fingers (e.g. a system gesture): ends everything, without a tap. */
  cancel(id: number) {
    if (this.phase === "pending") this.phase = "spent";
    this.up(id, Infinity);
  }

  private navigate() {
    this.phase = "navigate";
    this.reanchor();
  }

  /** Starts following the fingers from where they are now, or from where they landed. */
  private reanchor(from: "at" | "start" = "at") {
    const points = [...this.fingers.values()].slice(0, 2).map((f) => f[from]);
    this.anchor = points.length ? { camera: this.host.camera(), points, turnedFrom: 0 } : null;
  }

  /**
   * Moves the view so that the canvas follows the fingers: one finger moves it; two also
   * zoom it, and turn it once they turned enough.
   */
  private follow() {
    const anchor = this.anchor;
    if (!anchor) return;
    const now = [...this.fingers.values()].slice(0, 2).map((f) => f.at);
    if (now.length !== anchor.points.length) return this.reanchor();
    const [a0, b0] = anchor.points;
    const [a, b] = now;
    if (!b0 || !b) {
      this.host.setCamera(pan(anchor.camera, a.x - a0.x, a.y - a0.y));
      return;
    }
    const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const span0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    let turn = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));

    if (!this.rotating && this.host.mayRotate() && Math.abs(turn) > ROTATE_START) {
      // From now on the view turns with the fingers, from this angle: no jump.
      this.rotating = true;
      anchor.turnedFrom = turn;
    }
    let camera = anchor.camera;
    if (span0 > 0 && span > 0) camera = zoomAt(camera, mid0, span / span0);
    if (this.rotating) camera = rotateAt(camera, mid0, turn - anchor.turnedFrom);
    this.host.setCamera(pan(camera, mid.x - mid0.x, mid.y - mid0.y));
  }
}
