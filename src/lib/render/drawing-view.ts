// Displays a drawing with PixiJS.
//
// Each non-empty tile of each layer is a sprite with its own texture. The view listens to
// the drawing's change notifications, collects what changed, and applies it once per frame
// in `flush`: only the tiles that changed are uploaded to the GPU again, and only their
// changed rows when the change says which part changed (strokes in progress).

import {
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
  TilingSprite,
  type BLEND_MODES as PixiBlendMode,
  type SCALE_MODE,
} from "pixi.js";
import type { Drawing, DrawingChange } from "#lib/core/document/drawing.js";
import type { BlendMode, ReadonlyLayer } from "#lib/core/document/layer.js";
import { TILE_SIZE, tileCoord } from "#lib/core/document/tiles.js";
import { pixelStamp } from "#lib/core/brush/raster.js";
import { union, type Rect } from "#lib/core/geometry.js";
import { visibleRect, type Camera } from "./camera";

const PIXI_BLEND: Record<BlendMode, PixiBlendMode> = {
  normal: "normal",
  screen: "screen",
  add: "add",
};

/** Above this zoom, pixels are shown as crisp squares. */
const NEAREST_FROM_ZOOM = 1;
/** Above this zoom, a grid shows the pixel boundaries. */
const GRID_FROM_ZOOM = 8;

class LayerView {
  readonly container = new Container();
  private sprites = new Map<number, Sprite>();

  constructor(
    private readonly layer: ReadonlyLayer,
    private scaleMode: SCALE_MODE,
  ) {}

  syncProps() {
    this.container.visible = this.layer.visible;
    this.container.alpha = this.layer.opacity;
    this.container.blendMode = PIXI_BLEND[this.layer.blendMode];
  }

  /** Updates a tile's sprite. `area`: the part that changed (tile pixels), or the whole tile. */
  syncTile(key: number, area: Rect | null = null) {
    const { tx, ty } = tileCoord(key);
    const data = this.layer.tiles.getTile(tx, ty);
    const sprite = this.sprites.get(key);
    if (!data) {
      if (sprite) {
        sprite.destroy({ texture: true, textureSource: true });
        this.sprites.delete(key);
      }
      return;
    }
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (sprite) {
      const source = sprite.texture.source as BufferImageSource;
      source.resource = bytes;
      // Rows only: Pixi uploads a range of texels.
      if (area) source.update(area.y * TILE_SIZE, (area.y + area.height) * TILE_SIZE);
      else source.update();
      return;
    }
    const source = new BufferImageSource({
      resource: bytes,
      width: TILE_SIZE,
      height: TILE_SIZE,
      alphaMode: "premultiplied-alpha",
      scaleMode: this.scaleMode,
    });
    const created = new Sprite(new Texture({ source }));
    created.position.set(tx * TILE_SIZE, ty * TILE_SIZE);
    // Skipped when off screen (see CullerPlugin).
    created.cullable = true;
    this.container.addChild(created);
    this.sprites.set(key, created);
  }

  syncAll() {
    const present = new Set(this.layer.tiles.keys());
    for (const key of [...this.sprites.keys()]) if (!present.has(key)) this.syncTile(key);
    for (const key of present) this.syncTile(key);
    this.syncProps();
  }

  setScaleMode(mode: SCALE_MODE) {
    if (mode === this.scaleMode) return;
    this.scaleMode = mode;
    for (const sprite of this.sprites.values()) {
      const source = sprite.texture.source;
      source.scaleMode = mode;
      // Pixi does not notice the change on its own once the texture has been used.
      source.style.update();
    }
  }

  get tileCount() {
    return this.sprites.size;
  }

  destroy() {
    this.container.destroy({ children: true, texture: true, textureSource: true });
    this.sprites.clear();
  }
}

/**
 * Brush outline at a canvas position: a circle (soft brushes), or the exact pixels of a
 * pixel-art tip, square or round.
 */
export type BrushCursorState =
  | { kind: "circle" | "square" | "pixel-round"; size: number; x: number; y: number }
  | { kind: "none"; x: number; y: number };

export class DrawingView {
  /** Add this to the stage. */
  readonly root = new Container();
  /** Holds everything in canvas coordinates; the camera transform is applied to it. */
  private canvasRoot = new Container();
  private layersRoot = new Container();
  /** Checkerboard in screen space (no moiré when zoomed or rotated), cut to the canvas. */
  private checker: TilingSprite;
  private checkerMask = new Graphics();
  private grid = new Graphics();
  private cursor = new Graphics();
  private cursorState: BrushCursorState | null = null;
  private zoom = 1;
  private views = new Map<string, LayerView>();
  /** Changed tiles by layer, with their changed area (null: the whole tile). */
  private dirtyTiles = new Map<string, Map<number, Rect | null>>();
  private dirtyProps = new Set<string>();
  private orderDirty = false;
  private scaleMode: SCALE_MODE = "linear";
  private unsubscribe: () => void;

  constructor(private readonly drawing: Drawing) {
    this.checker = new TilingSprite({ texture: checkerTexture(), width: 1, height: 1 });
    this.checkerMask.rect(0, 0, drawing.width, drawing.height).fill(0xffffff);
    this.checker.mask = this.checkerMask;
    this.canvasRoot.addChild(this.checkerMask, this.layersRoot, this.grid, this.cursor);
    this.root.addChild(this.checker, this.canvasRoot);
    for (const layer of drawing.layers) this.addView(layer.id);
    this.orderDirty = true;
    this.unsubscribe = drawing.subscribe((change) => this.onChange(change));
  }

  /** Number of tile sprites currently on the GPU. */
  get tileCount(): number {
    let count = 0;
    for (const view of this.views.values()) count += view.tileCount;
    return count;
  }

  /** Applies the camera, for a view of the given size in screen pixels. */
  setCamera(camera: Camera, view: { width: number; height: number }) {
    this.canvasRoot.position.set(camera.x, camera.y);
    this.canvasRoot.scale.set(camera.zoom);
    this.canvasRoot.rotation = camera.rotation;
    this.zoom = camera.zoom;
    this.checker.width = view.width;
    this.checker.height = view.height;
    const mode: SCALE_MODE = camera.zoom >= NEAREST_FROM_ZOOM ? "nearest" : "linear";
    if (mode !== this.scaleMode) {
      this.scaleMode = mode;
      for (const layerView of this.views.values()) layerView.setScaleMode(mode);
    }
    this.drawGrid(camera, view);
    this.drawCursor();
  }

  /** Shows the brush outline at a canvas position, or hides it. */
  setBrushCursor(cursor: BrushCursorState | null) {
    this.cursorState = cursor;
    this.drawCursor();
  }

  private drawCursor() {
    const g = this.cursor;
    g.clear();
    const c = this.cursorState;
    if (!c || c.kind === "none") return;
    // Two tones, one screen pixel apart, to stay visible on any background.
    const px = 1 / this.zoom;
    if (c.size * this.zoom < 6) {
      const arm = 6 * px;
      for (const [color, offset] of [
        [0xffffff, px],
        [0x000000, 0],
      ] as const) {
        g.moveTo(c.x - arm + offset, c.y + offset).lineTo(c.x + arm + offset, c.y + offset);
        g.moveTo(c.x + offset, c.y - arm + offset).lineTo(c.x + offset, c.y + arm + offset);
        g.stroke({ width: 1, color, alpha: 0.8, pixelLine: true });
      }
      if (c.kind === "circle") return;
    }
    if (c.kind === "circle") {
      g.circle(c.x, c.y, c.size / 2 + px).stroke({
        width: 1,
        color: 0xffffff,
        alpha: 0.8,
        pixelLine: true,
      });
      g.circle(c.x, c.y, c.size / 2).stroke({
        width: 1,
        color: 0x000000,
        alpha: 0.8,
        pixelLine: true,
      });
    } else if (c.kind === "pixel-round") {
      this.drawStampOutline(Math.floor(c.x), Math.floor(c.y), c.size, px);
    } else {
      const n = Math.max(1, Math.round(c.size));
      const x = Math.floor(c.x) - Math.floor(n / 2);
      const y = Math.floor(c.y) - Math.floor(n / 2);
      g.rect(x - px, y - px, n + 2 * px, n + 2 * px).stroke({
        width: 1,
        color: 0xffffff,
        alpha: 0.8,
        pixelLine: true,
      });
      g.rect(x, y, n, n).stroke({ width: 1, color: 0x000000, alpha: 0.8, pixelLine: true });
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
      if (!inside.has(`${p.x},${p.y - 1}`)) edges.push([left, top, left + 1, top]);
      if (!inside.has(`${p.x},${p.y + 1}`)) edges.push([left, top + 1, left + 1, top + 1]);
      if (!inside.has(`${p.x - 1},${p.y}`)) edges.push([left, top, left, top + 1]);
      if (!inside.has(`${p.x + 1},${p.y}`)) edges.push([left + 1, top, left + 1, top + 1]);
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

  private drawGrid(camera: Camera, view: { width: number; height: number }) {
    this.grid.clear();
    if (camera.zoom < GRID_FROM_ZOOM) return;
    const area = visibleRect(camera, view, this.drawing);
    if (!area) return;
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    for (let x = area.x; x <= right; x++) this.grid.moveTo(x, area.y).lineTo(x, bottom);
    for (let y = area.y; y <= bottom; y++) this.grid.moveTo(area.x, y).lineTo(right, y);
    this.grid.stroke({ width: 1, color: 0x808080, alpha: 0.4, pixelLine: true });
  }

  /** Applies the pending changes. Call once per frame, before rendering. */
  flush() {
    if (this.orderDirty) {
      this.layersRoot.removeChildren();
      for (const layer of this.drawing.layers) {
        this.layersRoot.addChild(this.views.get(layer.id)!.container);
      }
      this.orderDirty = false;
    }
    for (const id of this.dirtyProps) this.views.get(id)?.syncProps();
    this.dirtyProps.clear();
    for (const [id, keys] of this.dirtyTiles) {
      const view = this.views.get(id);
      if (view) for (const [key, area] of keys) view.syncTile(key, area);
    }
    this.dirtyTiles.clear();
  }

  destroy() {
    this.unsubscribe();
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.root.destroy({ children: true, texture: true, textureSource: true });
  }

  private onChange(change: DrawingChange) {
    switch (change.type) {
      case "layer-added":
        this.addView(change.id);
        this.orderDirty = true;
        break;
      case "layer-removed":
        this.views.get(change.id)?.destroy();
        this.views.delete(change.id);
        this.dirtyTiles.delete(change.id);
        this.dirtyProps.delete(change.id);
        this.orderDirty = true;
        break;
      case "layer-moved":
        this.orderDirty = true;
        break;
      case "layer-updated":
        this.dirtyProps.add(change.id);
        break;
      case "pixels-changed": {
        let keys = this.dirtyTiles.get(change.id);
        if (!keys) this.dirtyTiles.set(change.id, (keys = new Map()));
        change.tiles.forEach((key, i) => {
          const area = change.areas?.[i] ?? null;
          const previous = keys.get(key);
          if (previous === undefined) keys.set(key, area);
          else if (previous !== null) keys.set(key, area && union(previous, area));
        });
        break;
      }
    }
  }

  private addView(id: string) {
    const view = new LayerView(this.drawing.getLayer(id), this.scaleMode);
    view.syncAll();
    this.views.set(id, view);
  }
}

/** Light gray checkerboard, shown under transparent areas. */
function checkerTexture(): Texture {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#cfcfcf";
  ctx.fillRect(0, 0, size * 2, size * 2);
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, size, size);
  ctx.fillRect(size, size, size, size);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}
