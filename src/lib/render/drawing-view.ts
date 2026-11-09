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
import { selectionHandles } from "#lib/core/selection/handles.js";
import { corners, toCanvas, type Placement, type Point } from "#lib/core/selection/placement.js";
import type { OutlineRun } from "#lib/core/selection/shape.js";
import { toScreen, visibleRect, type Camera } from "./camera";
import { CONTRAST_BLEND } from "./contrast-blend";

const PIXI_BLEND: Record<BlendMode, PixiBlendMode> = {
  normal: "normal",
  screen: "screen",
  add: "add",
};

/** Above this zoom, pixels are shown as crisp squares. */
const NEAREST_FROM_ZOOM = 1;
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
      if (area) {
        source.update(area.y * TILE_SIZE, (area.y + area.height) * TILE_SIZE);
      } else {
        source.update();
      }
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
    for (const key of [...this.sprites.keys()]) {
      if (!present.has(key)) {
        this.syncTile(key);
      }
    }
    for (const key of present) {
      this.syncTile(key);
    }
    this.syncProps();
  }

  setScaleMode(mode: SCALE_MODE) {
    if (mode === this.scaleMode) {
      return;
    }
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
 * pixel-art tip, square or round: filled with `fill` (the color it would draw, 0xRRGGBB, and
 * its opacity), or outlined.
 */
export type BrushCursorState =
  | { kind: "circle"; size: number; x: number; y: number }
  | {
      kind: "square" | "pixel-round";
      size: number;
      x: number;
      y: number;
      fill?: { color: number; alpha: number };
    }
  | { kind: "picker"; x: number; y: number }
  | { kind: "none"; x: number; y: number };

export class DrawingView {
  /** Add this to the stage. */
  readonly root = new Container();
  /** Holds everything in canvas coordinates; the camera transform is applied to it. */
  private canvasRoot = new Container();
  private layersRoot = new Container();
  /**
   * Checkerboard under the transparent areas, on the canvas: its squares are whole pixels of
   * the drawing, aligned on its grid (like Aseprite's). See CHECKER_SIZE.
   */
  private checker: TilingSprite;
  /** Cuts the layers to the canvas a resize would make, while it is previewed. */
  private previewMask = new Graphics();
  /** The pixels' grid, in contrast with what is under it. */
  private grid = new Graphics();
  /** The tiles' grid, in its own color. */
  private tileLines = new Graphics();
  private tileGrid: { width: number; height: number } | null = null;
  private selection = new Graphics();
  private selectionPlace: Placement | null = null;
  private selectionPivot: Point | null = null;
  /** The exact pixels a selection being made would select, over the layers. */
  private selectionDraft = new Sprite();
  /** A lasso's outline, in pixels of its box. Null: the box itself. */
  private selectionOutline: OutlineRun[] | null = null;
  private selectionHasHandles = false;
  /** Which dashes of the moving outline are drawn: changes a few times per second. */
  private dashPhase = 0;
  /** A pixel-art tip's pixels under the pen, on the canvas. */
  private cursor = new Graphics();
  /** The pointer, on the screen: a soft brush's circle, in contrast with what is under it. */
  private pointerRing = new Graphics();
  /** The pointer, on the screen: a small cross. */
  private pointerCross = new Graphics();
  /** The pointer, on the screen: a pipette, its tip on the pixel picked. */
  private pointerPicker = new Graphics().svg(PIPETTE_SVG);
  private cursorState: BrushCursorState | null = null;
  private camera: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
  private zoom = 1;
  private views = new Map<string, LayerView>();
  /** Changed tiles by layer, with their changed area (null: the whole tile). */
  private dirtyTiles = new Map<string, Map<number, Rect | null>>();
  private dirtyProps = new Set<string>();
  private orderDirty = false;
  private scaleMode: SCALE_MODE = "linear";
  private gridShown = false;
  private unsubscribe: () => void;

  constructor(private readonly drawing: Drawing) {
    this.checker = new TilingSprite({ texture: checkerTexture(), width: 1, height: 1 });
    this.setCheckerArea({ x: 0, y: 0, width: drawing.width, height: drawing.height });
    this.canvasRoot.addChild(
      this.checker,
      this.previewMask,
      this.layersRoot,
      this.grid,
      this.tileLines,
      this.selectionDraft,
      this.selection,
      this.cursor,
    );
    this.grid.blendMode = CONTRAST_BLEND;
    this.selectionDraft.blendMode = CONTRAST_BLEND;
    this.selectionDraft.visible = false;
    this.pointerRing.blendMode = CONTRAST_BLEND;
    this.pointerPicker.pivot.set(PIPETTE_TIP.x, PIPETTE_TIP.y);
    this.pointerPicker.scale.set(PIPETTE_SIZE / 24);
    this.pointerPicker.visible = false;
    this.root.addChild(this.canvasRoot, this.pointerRing, this.pointerCross, this.pointerPicker);
    for (const layer of drawing.layers) {
      this.addView(layer.id);
    }
    this.orderDirty = true;
    this.unsubscribe = drawing.subscribe((change) => this.onChange(change));
  }

  /** Number of tile sprites currently on the GPU. */
  get tileCount(): number {
    let count = 0;
    for (const view of this.views.values()) {
      count += view.tileCount;
    }
    return count;
  }

  /** Applies the camera, for a view of the given size in screen pixels. */
  setCamera(camera: Camera, view: { width: number; height: number }) {
    // Unturned, the canvas starts on a device pixel: at a whole zoom, every pixel then covers
    // the same device pixels, with crisp edges (see pixel-zoom.ts). Only drawn so: the camera
    // keeps its position, so slow moves don't get lost in the rounding.
    const r = globalThis.devicePixelRatio || 1;
    const snap = (v: number) => (camera.rotation === 0 ? Math.round(v * r) / r : v);
    this.canvasRoot.position.set(snap(camera.x), snap(camera.y));
    this.canvasRoot.scale.set(camera.mirrored ? -camera.zoom : camera.zoom, camera.zoom);
    this.canvasRoot.rotation = camera.rotation;
    this.camera = camera;
    this.zoom = camera.zoom;
    // Squares at least a few screen pixels wide: smaller, they would shimmer (moiré).
    let square = CHECKER_SIZE;
    while (square * camera.zoom < CHECKER_MIN_ON_SCREEN) {
      square *= 2;
    }
    this.checker.tileScale.set(square);
    const mode: SCALE_MODE = camera.zoom >= NEAREST_FROM_ZOOM ? "nearest" : "linear";
    if (mode !== this.scaleMode) {
      this.scaleMode = mode;
      for (const layerView of this.views.values()) {
        layerView.setScaleMode(mode);
      }
    }
    this.drawGrid(camera, view);
    this.drawSelection();
    this.drawCursor();
  }

  /**
   * Shows what a new canvas size would give, without changing the drawing: the canvas
   * (`rect`, in canvas pixels now: it may reach past them) and the layers in it, stretched by
   * `scale` (an image scaled from the top left corner). Null: the drawing as it is.
   */
  setResizePreview(preview: { rect: Rect; scaleX: number; scaleY: number } | null) {
    const { width, height } = this.drawing;
    const rect = preview?.rect ?? { x: 0, y: 0, width, height };
    this.setCheckerArea(rect);
    this.previewMask.clear();
    if (preview) {
      this.previewMask.rect(rect.x, rect.y, rect.width, rect.height).fill(0xffffff);
    }
    this.layersRoot.mask = preview ? this.previewMask : null;
    this.layersRoot.scale.set(preview?.scaleX ?? 1, preview?.scaleY ?? 1);
    // The grid and the selection belong to the drawing as it is.
    this.grid.visible = !preview;
    this.tileLines.visible = !preview;
    this.selection.visible = !preview;
  }

  /** The checkerboard over `rect` of the canvas, its squares still aligned on the canvas. */
  private setCheckerArea(rect: Rect) {
    this.checker.position.set(rect.x, rect.y);
    this.checker.width = rect.width;
    this.checker.height = rect.height;
    this.checker.tilePosition.set(-rect.x, -rect.y);
  }

  /** Shows the brush outline at a canvas position, or hides it. */
  setBrushCursor(cursor: BrushCursorState | null) {
    this.cursorState = cursor;
    this.drawCursor();
  }

  /** Shows the selection's outline, with its handles or not. Null: no selection. */
  setSelection(
    place: Placement | null,
    pivot: Point | null,
    outline: OutlineRun[] | null,
    handles: boolean,
  ) {
    this.selectionPlace = place;
    this.selectionOutline = outline;
    this.selectionPivot = pivot;
    this.selectionHasHandles = handles;
    this.drawSelection();
  }

  /**
   * Shows the pixels a selection being made would select: those of `rect`, or those of it where
   * `mask` is 1. Null: none.
   */
  setSelectionDraft(draft: { rect: Rect; mask: Uint8Array | null } | null) {
    const sprite = this.selectionDraft;
    sprite.visible = !!draft;
    if (!draft) {
      return;
    }
    const { rect, mask } = draft;
    this.showDraftMask(rect, mask);
    sprite.position.set(rect.x, rect.y);
    sprite.setSize(rect.width, rect.height);
  }

  private showDraftMask(rect: Rect, mask: Uint8Array | null) {
    const sprite = this.selectionDraft;
    const old = sprite.texture;
    const ours = old !== Texture.EMPTY && old !== Texture.WHITE;
    let bytes: Uint8Array | null = null;
    if (mask) {
      const texels = new Uint32Array(mask.length);
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          texels[i] = 0xffffffff;
        }
      }
      bytes = new Uint8Array(texels.buffer);
    }
    if (bytes && ours && old.width === rect.width && old.height === rect.height) {
      const source = old.source as BufferImageSource;
      source.resource = bytes;
      source.update();
      return;
    }
    sprite.texture = bytes
      ? new Texture({
          source: new BufferImageSource({
            resource: bytes,
            width: rect.width,
            height: rect.height,
            alphaMode: "premultiplied-alpha",
            scaleMode: "nearest",
          }),
        })
      : Texture.WHITE;
    if (ours) {
      old.destroy(true);
    }
  }

  private drawSelection() {
    const g = this.selection;
    g.clear();
    const place = this.selectionPlace;
    if (!place) {
      return;
    }
    const line = { width: 1, pixelLine: true };
    const frame = corners(place);
    const pieces: [Point, Point][] = this.selectionOutline
      ? this.selectionOutline.map(({ x0, y0, x1, y1 }) => [
          toCanvas(place, place.x + x0, place.y + y0),
          toCanvas(place, place.x + x1, place.y + y1),
        ])
      : frame.map((from, i) => [from, frame[(i + 1) % frame.length]]);
    this.drawDashes(pieces);
    if (!this.selectionHasHandles) {
      return;
    }
    // Around a lasso, the frame its handles belong to.
    if (this.selectionOutline) {
      g.poly(
        frame.flatMap(({ x, y }) => [x, y]),
        true,
      ).stroke({ ...line, color: 0xffffff, alpha: 0.5 });
    }
    for (const { group, shape } of selectionHandles(place, this.zoom, this.selectionPivot)) {
      const { x, y, width, height } = shape;
      const cx = x + width / 2;
      const cy = y + height / 2;
      switch (group) {
        case "bounds":
          // Bars, not squares: they only slide an edge, they do not scale anything.
          g.roundRect(x, y, width, height, Math.min(width, height) / 2);
          break;
        case "content":
          g.rect(x, y, width, height);
          break;
        case "pivot":
          g.circle(cx, cy, width / 2);
          g.fill(0xffffff).stroke({ ...line, color: 0x000000 });
          g.moveTo(x, cy)
            .lineTo(x + width, cy)
            .moveTo(cx, y)
            .lineTo(cx, y + height);
          g.stroke({ ...line, color: 0x000000 });
          continue;
      }
      g.fill(0xffffff).stroke({ ...line, color: 0x000000 });
    }
  }

  /** A line that stays visible on any background: white, with moving black dashes. */
  private drawDashes(pieces: [Point, Point][]) {
    const g = this.selection;
    const line = { width: 1, pixelLine: true };
    const lengths = pieces.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y));
    // Black dashes over white, moving, to stay visible on any background. Longer on a very
    // large outline, to keep the number of segments reasonable.
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const dash = Math.max(4 / this.zoom, total / 2000);
    for (const [a, b] of pieces) {
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ ...line, color: 0xffffff });
    pieces.forEach(([a, b], i) => {
      const length = lengths[i];
      const dx = (b.x - a.x) / length;
      const dy = (b.y - a.y) / length;
      for (let s = this.dashPhase * dash; s < length; s += dash * 2) {
        const end = Math.min(length, s + dash);
        g.moveTo(a.x + dx * s, a.y + dy * s).lineTo(a.x + dx * end, a.y + dy * end);
      }
    });
    g.stroke({ ...line, color: 0x000000 });
  }

  /**
   * The pointer, drawn rather than the system's (whose custom images are misplaced on scaled
   * screens): a soft brush's circle as large as it paints at most, in a thin line that
   * contrasts with what is under it (a small cross when tiny); a pixel-art tip's pixels in
   * the color they would get (outlined for erasers), under the system pointer.
   */
  private drawCursor() {
    const g = this.cursor;
    g.clear();
    this.pointerRing.clear();
    this.pointerCross.clear();
    this.pointerPicker.visible = false;
    const c = this.cursorState;
    if (!c || c.kind === "none") {
      return;
    }
    const screen = toScreen(this.camera, c);
    if (c.kind === "picker") {
      this.pointerPicker.position.set(screen.x, screen.y);
      this.pointerPicker.visible = true;
      return;
    }
    if (c.kind === "circle") {
      const radius = (c.size / 2) * this.zoom;
      if (radius * 2 < MIN_RING) {
        return this.drawCross(screen);
      }
      this.pointerRing
        .circle(screen.x, screen.y, radius)
        .stroke({ width: 1, color: 0xffffff, pixelLine: true });
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
    const px = 1 / this.zoom;
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

  /**
   * A small cross at a screen point, open at its center: black, edged with white, each line
   * one device pixel wide.
   */
  private drawCross(at: Point) {
    const g = this.pointerCross;
    const d = 1 / devicePixelRatio;
    // The center of the device pixel under the point.
    const cx = (Math.floor(at.x * devicePixelRatio) + 0.5) * d;
    const cy = (Math.floor(at.y * devicePixelRatio) + 0.5) * d;
    const arms = (grow: number) => {
      for (const sign of [-1, 1]) {
        const from = CROSS_GAP * sign;
        const to = CROSS_ARM * sign;
        const x0 = Math.min(cx + from, cx + to) - grow;
        const length = Math.abs(to - from) + 2 * grow;
        g.rect(x0, cy - d / 2 - grow, length, d + 2 * grow);
        g.rect(cx - d / 2 - grow, Math.min(cy + from, cy + to) - grow, d + 2 * grow, length);
      }
    };
    arms(d);
    g.fill({ color: 0xffffff, alpha: 0.9 });
    arms(0);
    g.fill({ color: 0x000000 });
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

  private drawGrid(camera: Camera, view: { width: number; height: number }) {
    this.grid.clear();
    this.tileLines.clear();
    const area = visibleRect(camera, view, this.drawing);
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

  /** Applies the pending changes. Call once per frame, before rendering. */
  flush() {
    if (this.selectionPlace) {
      const phase = Math.floor(performance.now() / 150) % 2;
      if (phase !== this.dashPhase) {
        this.dashPhase = phase;
        this.drawSelection();
      }
    }
    if (this.orderDirty) {
      this.layersRoot.removeChildren();
      for (const layer of this.drawing.layers) {
        this.layersRoot.addChild(this.views.get(layer.id)!.container);
      }
      this.orderDirty = false;
    }
    for (const id of this.dirtyProps) {
      this.views.get(id)?.syncProps();
    }
    this.dirtyProps.clear();
    for (const [id, keys] of this.dirtyTiles) {
      const view = this.views.get(id);
      if (view) {
        for (const [key, area] of keys) {
          view.syncTile(key, area);
        }
      }
    }
    this.dirtyTiles.clear();
  }

  destroy() {
    this.unsubscribe();
    for (const view of this.views.values()) {
      view.destroy();
    }
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
        if (!keys) {
          this.dirtyTiles.set(change.id, (keys = new Map()));
        }
        change.tiles.forEach((key, i) => {
          const area = change.areas?.[i] ?? null;
          const previous = keys.get(key);
          if (previous === undefined) {
            keys.set(key, area);
          } else if (previous !== null) {
            keys.set(key, area && union(previous, area));
          }
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

/** The side of the checkerboard's squares, in pixels of the drawing (Aseprite's default). */
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

/** Below this diameter on screen, a soft brush shows as the small cross. */
const MIN_RING = 6;
/** The small cross: its arms, from the center, in screen pixels. */
const CROSS_GAP = 2;
const CROSS_ARM = 7;

const CHECKER_SIZE = 16;
/** Below this many screen pixels, the squares double in size. */
const CHECKER_MIN_ON_SCREEN = 6;

/**
 * Gray checkerboard, one texel per square: scaled to the squares' size. Aseprite's colors,
 * the dark one at the top left.
 */
function checkerTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(0, 0, 2, 2);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillRect(1, 1, 1, 1);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}
