// Pixel art strokes: the pen path as a chain of pixels, without anti-aliasing.
//
// Consecutive samples are joined with Bresenham lines. In pixel-perfect mode, "L" corners
// (a pixel touching both its neighbors by a side while they touch each other by a corner)
// are removed, like in Aseprite, so diagonal lines stay one pixel thin.

export interface Pixel {
  x: number;
  y: number;
}

/** Pixels of the line from `a` to `b`, both included (Bresenham, 8-connected). */
export function pixelLine(a: Pixel, b: Pixel): Pixel[] {
  const pixels: Pixel[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pixels.push({ x, y });
    if (x === b.x && y === b.y) {
      return pixels;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export class PixelPathBuilder {
  /** Pixels of the path, in order. The last one may still be removed by pixel-perfect. */
  private path: Pixel[] = [];

  constructor(private readonly pixelPerfect: boolean) {}

  /**
   * Adds a pen sample (canvas coordinates, any precision).
   * Returns the pixels to paint now, and the pixel to restore if a corner was removed.
   */
  add(x: number, y: number): { paint: Pixel[]; unpaint: Pixel[] } {
    const target = { x: Math.floor(x), y: Math.floor(y) };
    const last = this.path.at(-1);
    if (last && last.x === target.x && last.y === target.y) {
      return { paint: [], unpaint: [] };
    }
    const line = last ? pixelLine(last, target).slice(1) : [target];
    const paint: Pixel[] = [];
    const unpaint: Pixel[] = [];
    for (const p of line) {
      this.path.push(p);
      paint.push(p);
      if (this.pixelPerfect && this.isCorner()) {
        // Remove the middle pixel of the last three.
        const [corner] = this.path.splice(this.path.length - 2, 1);
        const index = paint.findIndex((q) => q.x === corner.x && q.y === corner.y);
        if (index >= 0) {
          paint.splice(index, 1);
        } else {
          unpaint.push(corner);
        }
      }
    }
    return { paint, unpaint };
  }

  /** All the pixels of the path so far. */
  get pixels(): readonly Pixel[] {
    return this.path;
  }

  private isCorner(): boolean {
    const n = this.path.length;
    if (n < 3) {
      return false;
    }
    const [a, b, c] = [this.path[n - 3], this.path[n - 2], this.path[n - 1]];
    const side = (p: Pixel, q: Pixel) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
    const diagonal = (p: Pixel, q: Pixel) => Math.abs(p.x - q.x) === 1 && Math.abs(p.y - q.y) === 1;
    return side(a, b) && side(b, c) && diagonal(a, c);
  }
}
