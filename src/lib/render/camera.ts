// View transform between canvas pixels and screen pixels: pan, zoom and rotation.
//
// screen = translate(x, y) · rotate(rotation) · scale(zoom) · canvas
// Pure math, no rendering, so it can be tested on its own.

export interface Point {
  x: number;
  y: number;
}

export interface Camera {
  /** Screen position of the canvas origin. */
  x: number;
  y: number;
  zoom: number;
  /** Radians. */
  rotation: number;
}

export const MIN_ZOOM = 1 / 64;
export const MAX_ZOOM = 64;

export function toScreen(c: Camera, p: Point): Point {
  const cos = Math.cos(c.rotation) * c.zoom;
  const sin = Math.sin(c.rotation) * c.zoom;
  return { x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos };
}

export function toCanvas(c: Camera, p: Point): Point {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const cos = Math.cos(c.rotation) / c.zoom;
  const sin = Math.sin(c.rotation) / c.zoom;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

export function pan(c: Camera, dx: number, dy: number): Camera {
  return { ...c, x: c.x + dx, y: c.y + dy };
}

/** Multiplies the zoom by `factor`, keeping the canvas point under `screen` in place. */
export function zoomAt(c: Camera, screen: Point, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor));
  return keepAt({ ...c, zoom }, toCanvas(c, screen), screen);
}

/** Rotates by `angle` radians around `screen`. */
export function rotateAt(c: Camera, screen: Point, angle: number): Camera {
  return keepAt(
    { ...c, rotation: normalizeAngle(c.rotation + angle) },
    toCanvas(c, screen),
    screen,
  );
}

/** Sets an absolute rotation around `screen`. */
export function setRotationAt(c: Camera, screen: Point, rotation: number): Camera {
  return rotateAt(c, screen, rotation - c.rotation);
}

/** Centers and zooms so the whole canvas fits in the view, without rotation. */
export function fit(
  canvas: { width: number; height: number },
  view: { width: number; height: number },
  margin = 0.9,
): Camera {
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(view.width / canvas.width, view.height / canvas.height) * margin),
  );
  return {
    x: (view.width - canvas.width * zoom) / 2,
    y: (view.height - canvas.height * zoom) / 2,
    zoom,
    rotation: 0,
  };
}

/** Moves the camera so that canvas point `p` is displayed at `screen`. */
function keepAt(c: Camera, p: Point, screen: Point): Camera {
  const moved = toScreen(c, p);
  return pan(c, screen.x - moved.x, screen.y - moved.y);
}

/** Wraps an angle to (-π, π]. */
function normalizeAngle(a: number): number {
  const turn = 2 * Math.PI;
  let r = a % turn;
  if (r > Math.PI) r -= turn;
  if (r <= -Math.PI) r += turn;
  return r;
}

/**
 * Canvas pixels visible in a view of the given size, as an integer rectangle clipped to the
 * canvas (the bounding box of the view when rotated). Null if the canvas is out of view.
 */
export function visibleRect(
  c: Camera,
  view: { width: number; height: number },
  canvas: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const corners = [
    toCanvas(c, { x: 0, y: 0 }),
    toCanvas(c, { x: view.width, y: 0 }),
    toCanvas(c, { x: 0, y: view.height }),
    toCanvas(c, { x: view.width, y: view.height }),
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const x1 = Math.min(canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const y1 = Math.min(canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
