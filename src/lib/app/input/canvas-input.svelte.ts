// The view's input: DOM pointer events (panning everywhere, drawing when there is no native
// input), fingers (see touch-gestures.ts), the native pen (Linux) and the keys held over the
// view (Space to pan, Alt, Esc). The camera moves through ViewNavigation.

import { consumeDismissal } from "#lib/app/shared/dismissal.js";
import { isTyping } from "#lib/app/commands/keyboard.js";
import type { Painter } from "#lib/app/input/painter.js";
import { PenInput } from "#lib/app/input/pen-input.svelte.js";
import { PointerLead } from "#lib/app/input/pointer-lead.js";
import { TouchGestures } from "#lib/app/input/touch-gestures.js";
import type { ViewNavigation } from "#lib/app/input/view-navigation.js";
import type { Sample } from "#lib/app/tools/tool.js";
import { nativePenAvailable, subscribeNativePen, type PenEvent } from "#lib/platform/pen.js";
import { pan, toCanvas, type Point } from "#lib/render/camera.js";

export interface CanvasInputHost {
  /** The view's element: positions are relative to it. */
  element(): HTMLElement;
  painter?: Painter;
  navigation: ViewNavigation;
  /** One finger draws; else it moves the view (see touch-gestures.ts). */
  fingerDraws(): boolean;
  /** Two fingers may turn the view. */
  mayRotate(): boolean;
  /** A pen was used: see LayoutPrefs.penSeen. */
  penUsed(): void;
  /** A gesture asks for a command: a two-finger tap undoes, a three-finger tap redoes. */
  command(id: string): void;
  /** Hides the brush's outline. */
  hideCursor(): void;
}

export class CanvasInput {
  spaceDown = $state(false);
  panning: { id: number; x: number; y: number } | null = $state(null);
  /** Fingers move the view: the brush's pointer is hidden meanwhile. */
  touchNavigating = $state(false);
  readonly pen: PenInput | null;
  readonly lead = new PointerLead();
  private readonly touch: TouchGestures;
  /** A finger is drawing (not the pen). */
  private touchStroke = false;

  constructor(private readonly host: CanvasInputHost) {
    const { painter, navigation } = host;
    this.pen = painter
      ? new PenInput({
          painter,
          consumeDismissal,
          // Only on the canvas itself, not over a panel or while panning.
          mayStartAt: (x, y) => {
            const target = document.elementFromPoint(x, y);
            return !this.spaceDown && !this.panning && !!target && host.element().contains(target);
          },
          sample: (e) => this.nativeSample(e),
        })
      : null;
    this.touch = new TouchGestures({
      camera: () => navigation.camera,
      setCamera: (camera) => navigation.set(camera),
      fingerDraws: () => host.fingerDraws(),
      mayRotate: () => host.mayRotate(),
      beginStroke: (p, time) => {
        this.touchStroke = !!this.pen?.domDown(this.sample(p, 1, { time }), false, true);
        return this.touchStroke;
      },
      moveStroke: (p, time) => this.pen?.domMove([this.sample(p, 1, { time })]),
      endStroke: () => {
        this.touchStroke = false;
        this.pen?.domUp();
      },
      cancelStroke: () => {
        this.touchStroke = false;
        this.pen?.cancel();
      },
      endNavigation: (at) => navigation.settleZoom(at),
      undo: () => host.command("history.undo"),
      redo: () => host.command("history.redo"),
    });
  }

  get stroking(): boolean {
    return this.pen?.stroking ?? false;
  }

  /** The pen came down: fingers still on the screen are the resting hand. */
  private penDown() {
    this.host.penUsed();
    this.touch.abandon();
    this.touchNavigating = false;
  }

  /** A window position, in view coordinates. */
  local(e: { clientX: number; clientY: number }): Point {
    const rect = this.host.element().getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** A drawing sample from a point in view coordinates. */
  private sample(
    p: Point,
    pressure: number,
    extra: { tiltX?: number; tiltY?: number; time?: number } = {},
  ): Sample {
    const camera = this.host.navigation.camera;
    return {
      ...toCanvas(camera, p),
      pressure,
      viewZoom: camera.zoom,
      viewRotation: (camera.rotation * 180) / Math.PI,
      ...extra,
    };
  }

  private domSample(e: PointerEvent): Sample {
    return this.sample(this.local(e), domPressure(e), {
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      time: e.timeStamp,
    });
  }

  /** A drawing sample from a native pen event (Linux): positions are relative to the webview. */
  private nativeSample(e: PenEvent): Sample {
    const rect = this.host.element().getBoundingClientRect();
    const p = { x: e.x - rect.left, y: e.y - rect.top };
    const pressure = e.source === "pen" || e.source === "eraser" ? e.pressure : 1;
    return this.sample(p, pressure, { tiltX: e.tiltX, tiltY: e.tiltY, time: e.time });
  }

  // DOM pointer events: panning everywhere, drawing when there is no native input.

  pointerDown(e: PointerEvent) {
    if (e.pointerType === "pen") {
      this.penDown();
    }
    if (e.pointerType === "touch") {
      // The palm, while the pen draws: ignored.
      if (this.stroking && !this.touchStroke) {
        return;
      }
      this.touch.down(e.pointerId, this.local(e), e.timeStamp);
      this.touchNavigating = this.touch.navigating;
      return;
    }
    const element = this.host.element();
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault();
      element.setPointerCapture(e.pointerId);
      this.panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.host.hideCursor();
      return;
    }
    // Button 5 is the pen's eraser end.
    if (!this.pen || (e.button !== 0 && e.button !== 5)) {
      return;
    }
    const eraser = e.button === 5 || (e.buttons & 32) !== 0;
    if (this.pen.domDown(this.domSample(e), eraser)) {
      element.setPointerCapture(e.pointerId);
    }
  }

  pointerMove(e: PointerEvent) {
    if (e.pointerType === "touch") {
      const events = this.touch.stroking ? (e.getCoalescedEvents?.() ?? []) : [];
      for (const c of events.length ? events : [e]) {
        this.touch.move(e.pointerId, this.local(c), c.timeStamp);
      }
      this.touchNavigating = this.touch.navigating;
      if (this.touchNavigating) {
        return;
      }
    }
    const navigation = this.host.navigation;
    if (this.panning?.id === e.pointerId) {
      navigation.set(
        pan(navigation.camera, e.clientX - this.panning.x, e.clientY - this.panning.y),
      );
      this.panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (this.stroking && e.pointerType !== "touch") {
      const events = e.getCoalescedEvents?.() ?? [];
      this.pen?.domMove((events.length ? events : [e]).map((c) => this.domSample(c)));
    }
    // A pen sends hundreds of moves a second: the pointer follows the last one, once per frame
    // (see showPointer in CanvasView), so they do not pile up behind it.
    this.lead.move({
      clientX: e.clientX,
      clientY: e.clientY,
      time: e.timeStamp,
      pen: e.pointerType === "pen",
    });
  }

  pointerUp(e: PointerEvent) {
    if (e.pointerType === "touch") {
      if (e.type === "pointercancel") {
        this.touch.cancel(e.pointerId);
      } else {
        this.touch.up(e.pointerId, e.timeStamp);
      }
      this.touchNavigating = this.touch.navigating;
      return;
    }
    if (this.panning?.id === e.pointerId) {
      this.panning = null;
    }
    // Not the stroke of a finger: a mouse button released elsewhere.
    if (!this.touchStroke) {
      this.pen?.domUp();
    }
  }

  keyDown(e: KeyboardEvent) {
    // Alt alone must not open a menu of the system or the browser.
    if (e.key === "Alt") {
      e.preventDefault();
    }
    if (e.code === "Space" && !isTyping(e)) {
      this.spaceDown = true;
      e.preventDefault();
    }
    // Also while the queue of a lifted stroke is still being painted.
    // Esc was for the stroke, not for the shortcut (see EditorApp).
    if (e.key === "Escape" && this.pen?.cancel()) {
      e.preventDefault();
    }
  }

  keyUp(e: KeyboardEvent) {
    if (e.key === "Alt") {
      e.preventDefault();
    }
    if (e.code === "Space") {
      this.spaceDown = false;
    }
  }

  /** Draws with the native pen events when there are (Linux), until `destroyed`. */
  connectNativePen(destroyed: () => boolean) {
    nativePenAvailable().then((available) => {
      const pen = this.pen;
      if (!available || destroyed() || !pen) {
        return;
      }
      pen.useNative();
      subscribeNativePen((e) => {
        if ((e.source === "pen" || e.source === "eraser") && e.phase === "down") {
          this.penDown();
        }
        if (!destroyed()) {
          pen.onNative(e);
        }
      });
    });
  }
}

/** Mice report 0.5 while pressed: they draw at full pressure. */
function domPressure(e: PointerEvent): number {
  return e.pointerType === "pen" || e.pointerType === "touch" ? e.pressure : 1;
}
