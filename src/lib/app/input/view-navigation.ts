// The view's camera and how it moves: fitting, zooming (by steps, to a value, with the wheel),
// turning and mirroring. Fitting and zooming use the area between the panels over the view.

import {
  fit,
  mirrorAt,
  rotateAt,
  setRotationAt,
  zoomAt,
  type Camera,
  type Point,
} from "#lib/render/camera.js";
import { isFreeZoom, snapZoomDown, snapZoomNearest, stepZoom } from "#lib/render/pixel-zoom.js";

/** Wheel movement, in pixels, for one zoom level in pixel art: about a mouse wheel's notch. */
const WHEEL_NOTCH = 100;

/** Space taken by panels over the view, in pixels, on each side. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewNavigationHost {
  /** The view's size, in window pixels. */
  size(): { width: number; height: number };
  /** Panels over the view: fitting and zooming use the area between them. */
  insets(): Insets | undefined;
  /** Zoomed out, the zoom keeps to levels where every pixel is the same size (pixel art). */
  pixelZoom(): boolean;
  /** The camera changed (or the view's size: the same camera is set again). */
  changed(camera: Camera): void;
}

export class ViewNavigation {
  camera: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
  /** In pixel art, wheel movement toward the next zoom level (see wheelZoom). */
  private wheelRest = 0;

  constructor(private readonly host: ViewNavigationHost) {}

  set(next: Camera) {
    this.camera = next;
    this.host.changed(next);
  }

  /** The part of the view that is not under panels. */
  visibleArea() {
    const { top, right, bottom, left } = this.host.insets() ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const { width, height } = this.host.size();
    return {
      x: left,
      y: top,
      width: Math.max(1, width - left - right),
      height: Math.max(1, height - top - bottom),
    };
  }

  center(): Point {
    const area = this.visibleArea();
    return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  }

  /** Fits the canvas in the view, unturned; a mirrored view stays mirrored. */
  fit(canvas: { width: number; height: number }) {
    const area = this.visibleArea();
    let fitted = fit(canvas, area);
    if (this.host.pixelZoom()) {
      // Around the middle of the area, where the canvas is centered.
      const middle = { x: area.width / 2, y: area.height / 2 };
      const zoom = snapZoomDown(fitted.zoom, devicePixelRatio);
      fitted = zoomAt(fitted, middle, zoom / fitted.zoom);
    }
    const next = { ...fitted, x: fitted.x + area.x, y: fitted.y + area.y };
    this.set(this.camera.mirrored ? mirrorAt(next, this.center()) : next);
  }

  /** Shows the drawing reversed, left to right, or back: the drawing doesn't change. */
  mirror() {
    this.set(mirrorAt(this.camera, this.center()));
  }

  /** One step in (1) or out (-1), around the center of the view. */
  zoomStep(direction: 1 | -1) {
    if (this.host.pixelZoom()) {
      this.zoomAround(this.center(), stepZoom(this.camera.zoom, devicePixelRatio, direction));
    } else {
      this.set(zoomAt(this.camera, this.center(), direction > 0 ? 1.25 : 0.8));
    }
  }

  /** Sets the zoom to an absolute value (the nearest level in pixel art), around the center. */
  zoomTo(zoom: number) {
    this.zoomAround(
      this.center(),
      this.host.pixelZoom() ? snapZoomNearest(zoom, devicePixelRatio) : zoom,
    );
  }

  zoomAround(at: Point, zoom: number) {
    if (zoom !== this.camera.zoom) {
      this.set(zoomAt(this.camera, at, zoom / this.camera.zoom));
    }
  }

  /** Fingers stopped moving the view: in pixel art, the zoom goes to the nearest level. */
  settleZoom(at: Point) {
    if (this.host.pixelZoom()) {
      this.zoomAround(at, snapZoomNearest(this.camera.zoom, devicePixelRatio));
    }
  }

  rotateBy(angle: number) {
    this.set(rotateAt(this.camera, this.center(), angle));
  }

  resetRotation() {
    this.set(setRotationAt(this.camera, this.center(), 0));
  }

  /** The wheel at `at` (view coordinates): it zooms, or with Shift turns the view. */
  wheel(at: Point, e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 40 : e.deltaY;
    if (e.shiftKey) {
      this.set(rotateAt(this.camera, at, (Math.sign(delta) * Math.PI) / 12));
    } else {
      this.wheelZoom(at, delta);
    }
  }

  /** Zooms with the wheel: smoothly, or in pixel art by levels when zoomed out. */
  private wheelZoom(at: Point, delta: number) {
    const factor = Math.exp(-delta * 0.0015);
    if (!this.host.pixelZoom()) {
      return this.set(zoomAt(this.camera, at, factor));
    }
    const dpr = devicePixelRatio;
    const free = isFreeZoom(this.camera.zoom, dpr);
    const target = this.camera.zoom * factor;
    if (free && isFreeZoom(target, dpr)) {
      this.wheelRest = 0;
      return this.set(zoomAt(this.camera, at, factor));
    }
    // Leaving the free zone: stops at its edge first.
    if (free && factor < 1) {
      this.wheelRest = 0;
      return this.zoomAround(at, stepZoom(this.camera.zoom, dpr, -1, Infinity));
    }
    // One level per notch of a mouse wheel; a touchpad adds up its small moves.
    if (Math.sign(delta) !== Math.sign(this.wheelRest)) {
      this.wheelRest = 0;
    }
    this.wheelRest += delta;
    if (Math.abs(this.wheelRest) < WHEEL_NOTCH) {
      return;
    }
    this.wheelRest = 0;
    this.zoomAround(at, stepZoom(this.camera.zoom, dpr, delta < 0 ? 1 : -1));
  }
}
