// The grids over the canvas: the pixels' grid and the tiles' grid, each shown on its own.

import { Graphics } from "pixi.js";
import { visibleRect, type Camera } from "#lib/render/camera.js";
import { CONTRAST_BLEND } from "#lib/render/contrast-blend.js";

/** Above this zoom, a grid shows the pixel boundaries. */
const GRID_FROM_ZOOM = 8;
/** The tiles' grid shows when a tile is at least this big on screen, in screen pixels. */
const TILE_GRID_FROM = 8;
/**
 * How strongly the pixels' grid stands out from what is under it (see CONTRAST_BLEND): it
 * shows on light and dark alike.
 */
const PIXEL_GRID_STRENGTH = 0.35;
/** The tiles' grid: a color of its own, not to be taken for the pixels' grid or the checker. */
const TILE_GRID_COLOR = 0x3d7dff;
const TILE_GRID_ALPHA = 0.8;

export class GridView {
  /** The pixels' grid, in contrast with what is under it. */
  readonly grid = new Graphics();
  /** The tiles' grid, in its own color. */
  readonly tileLines = new Graphics();
  private tileGrid: { width: number; height: number } | null = null;
  private gridShown = false;

  /** `canvas`: the drawing's size, read on each draw. */
  constructor(private readonly canvas: { readonly width: number; readonly height: number }) {
    this.grid.blendMode = CONTRAST_BLEND;
  }

  set visible(visible: boolean) {
    this.grid.visible = visible;
    this.tileLines.visible = visible;
  }

  /**
   * Shows the grids, each on its own: the pixels' grid (`shown`) when zoomed in enough, and
   * the tiles' grid (null: hidden) when its tiles are big enough on screen.
   */
  setGridShown(
    shown: boolean,
    tileGrid: { width: number; height: number } | null,
    camera: Camera,
    view: { width: number; height: number },
  ) {
    this.gridShown = shown;
    this.tileGrid = tileGrid;
    this.drawGrid(camera, view);
  }

  drawGrid(camera: Camera, view: { width: number; height: number }) {
    this.grid.clear();
    this.tileLines.clear();
    const area = visibleRect(camera, view, this.canvas);
    if (!area) {
      return;
    }
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    const tile = this.tileGrid;
    const tiles = tile && Math.min(tile.width, tile.height) * camera.zoom >= TILE_GRID_FROM;
    // Under a tile's line, no pixel's line: it would show at its sides.
    const onTileX = (x: number) => tiles && x % tile.width === 0;
    const onTileY = (y: number) => tiles && y % tile.height === 0;
    if (this.gridShown && camera.zoom >= GRID_FROM_ZOOM) {
      for (let x = area.x; x <= right; x++) {
        if (!onTileX(x)) {
          this.grid.moveTo(x, area.y).lineTo(x, bottom);
        }
      }
      for (let y = area.y; y <= bottom; y++) {
        if (!onTileY(y)) {
          this.grid.moveTo(area.x, y).lineTo(right, y);
        }
      }
      this.grid.stroke({ width: 1, color: 0xffffff, alpha: PIXEL_GRID_STRENGTH, pixelLine: true });
    }
    if (tiles) {
      // From the first tile line in view.
      const x0 = Math.ceil(area.x / tile.width) * tile.width;
      const y0 = Math.ceil(area.y / tile.height) * tile.height;
      const lines = this.tileLines;
      for (let x = x0; x <= right; x += tile.width) {
        lines.moveTo(x, area.y).lineTo(x, bottom);
      }
      for (let y = y0; y <= bottom; y += tile.height) {
        lines.moveTo(area.x, y).lineTo(right, y);
      }
      lines.stroke({ width: 1, color: TILE_GRID_COLOR, alpha: TILE_GRID_ALPHA, pixelLine: true });
    }
  }
}
