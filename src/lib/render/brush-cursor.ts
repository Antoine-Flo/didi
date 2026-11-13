// The pointer over the canvas, drawn by the view (see `BrushCursor.draw`).

import { Graphics } from "pixi.js";
import { pixelStamp } from "#lib/core/brush/raster.js";
import { toScreen, type Camera } from "#lib/render/camera.js";

/**
 * A pipette (Lucide's), with a white halo to show on dark colors: 24 units wide, its tip at
 * `PIPETTE_TIP`, shown `PIPETTE_SIZE` screen pixels wide.
 */
const PIPETTE_PATH =
  "m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12M18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3zM2 22l.414-.414";
const PIPETTE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
  `<path d="${PIPETTE_PATH}" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${PIPETTE_PATH}" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
  `</svg>`;
const PIPETTE_TIP = { x: 2, y: 22 };
const PIPETTE_SIZE = 18;

/**
 * Brush outline at a canvas position: the exact pixels of a pixel-art tip, square or round:
 * filled with `fill` (the color it would draw, 0xRRGGBB, and its opacity), or outlined.
 */
export type BrushCursorState =
  | {
      kind: "square" | "pixel-round";
      size: number;
      x: number;
      y: number;
      fill?: { color: number; alpha: number };
    }
  | { kind: "picker"; x: number; y: number }
  | { kind: "none"; x: number; y: number };

export class BrushCursor {
  /** A pixel-art tip's pixels under the pen, on the canvas. */
  readonly cursor = new Graphics();
  /** The pointer, on the screen: a pipette, its tip on the pixel picked. */
  readonly pointerPicker = new Graphics().svg(PIPETTE_SVG);

  constructor() {
    this.pointerPicker.pivot.set(PIPETTE_TIP.x, PIPETTE_TIP.y);
    this.pointerPicker.scale.set(PIPETTE_SIZE / 24);
    this.pointerPicker.visible = false;
  }

  /**
   * A pixel-art tip's pixels in the color they would get (outlined for erasers), under the
   * system pointer; or the pipette, drawn rather than the system's pointer (whose custom
   * images are misplaced on scaled screens).
   */
  draw(c: BrushCursorState | null, camera: Camera) {
    const g = this.cursor;
    g.clear();
    this.pointerPicker.visible = false;
    if (!c || c.kind === "none") {
      return;
    }
    if (c.kind === "picker") {
      const screen = toScreen(camera, c);
      this.pointerPicker.position.set(screen.x, screen.y);
      this.pointerPicker.visible = true;
      return;
    }
    // Pixel-art tips: the system pointer shows where the pen is (see CanvasView).
    const n = Math.max(1, Math.round(c.size));
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    if (c.fill) {
      if (c.kind === "square") {
        g.rect(x - Math.floor(n / 2), y - Math.floor(n / 2), n, n);
      } else {
        // One rectangle per row: the stamp's pixels come row by row, left to right.
        const stamp = pixelStamp(n, "round");
        for (let i = 0; i < stamp.length;) {
          let j = i + 1;
          while (j < stamp.length && stamp[j].y === stamp[i].y) {
            j++;
          }
          g.rect(x + stamp[i].x, y + stamp[i].y, stamp[j - 1].x - stamp[i].x + 1, 1);
          i = j;
        }
      }
      g.fill({ color: c.fill.color, alpha: c.fill.alpha });
      return;
    }
    // Two tones, one screen pixel apart, to stay visible on any background.
    const px = 1 / camera.zoom;
    if (c.kind === "pixel-round") {
      this.drawStampOutline(x, y, c.size, px);
    } else {
      const left = x - Math.floor(n / 2);
      const top = y - Math.floor(n / 2);
      g.rect(left - px, top - px, n + 2 * px, n + 2 * px).stroke({
        width: 1,
        color: 0xffffff,
        alpha: 0.8,
        pixelLine: true,
      });
      g.rect(left, top, n, n).stroke({ width: 1, color: 0x000000, alpha: 0.8, pixelLine: true });
    }
  }

  /** The outline of a round pixel-art tip at pixel (x, y): its pixels' outer edges. */
  private drawStampOutline(x: number, y: number, size: number, px: number) {
    const g = this.cursor;
    const stamp = pixelStamp(size, "round");
    const inside = new Set(stamp.map((p) => `${p.x},${p.y}`));
    const edges: [number, number, number, number][] = [];
    for (const p of stamp) {
      const left = x + p.x;
      const top = y + p.y;
      if (!inside.has(`${p.x},${p.y - 1}`)) {
        edges.push([left, top, left + 1, top]);
      }
      if (!inside.has(`${p.x},${p.y + 1}`)) {
        edges.push([left, top + 1, left + 1, top + 1]);
      }
      if (!inside.has(`${p.x - 1},${p.y}`)) {
        edges.push([left, top, left, top + 1]);
      }
      if (!inside.has(`${p.x + 1},${p.y}`)) {
        edges.push([left + 1, top, left + 1, top + 1]);
      }
    }
    // Two tones, like the other outlines: white one screen pixel off, then black.
    for (const [color, offset] of [
      [0xffffff, px],
      [0x000000, 0],
    ] as const) {
      for (const [x0, y0, x1, y1] of edges) {
        g.moveTo(x0 + offset, y0 + offset).lineTo(x1 + offset, y1 + offset);
      }
      g.stroke({ width: 1, color, alpha: 0.8, pixelLine: true });
    }
  }
}
