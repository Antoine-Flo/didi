// Displays a drawing with PixiJS.
//
// Each non-empty tile of each layer is a sprite with its own texture. The view listens to
// the drawing's change notifications, collects what changed, and applies it once per frame
// in `flush`: only the tiles that changed are uploaded to the GPU again, and only their
// changed rows when the change says which part changed (strokes in progress).

import { Container, Graphics, Texture, TilingSprite, type SCALE_MODE } from "pixi.js";
import type { Drawing, DrawingChange } from "#lib/core/document/drawing.js";
import { union, type Rect } from "#lib/core/shared/geometry.js";
import type { Placement, Point } from "#lib/core/selection/placement.js";
import type { OutlineRun } from "#lib/core/selection/shape.js";
import { BrushCursor, type BrushCursorState } from "#lib/render/brush-cursor.js";
import type { Camera } from "#lib/render/camera.js";
import { GridView } from "#lib/render/grid-view.js";
import { LayerView } from "#lib/render/layer-view.js";
import { SelectionView } from "#lib/render/selection-view.js";

/** Above this zoom, pixels are shown as crisp squares. */
const NEAREST_FROM_ZOOM = 1;

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
  private grids: GridView;
  private selection = new SelectionView();
  private brushCursor = new BrushCursor();
  private cursorState: BrushCursorState | null = null;
  private camera: Camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
  private views = new Map<string, LayerView>();
  /** Changed tiles by layer, with their changed area (null: the whole tile). */
  private dirtyTiles = new Map<string, Map<number, Rect | null>>();
  private dirtyProps = new Set<string>();
  private orderDirty = false;
  private scaleMode: SCALE_MODE = "linear";
  private unsubscribe: () => void;

  constructor(private readonly drawing: Drawing) {
    this.checker = new TilingSprite({ texture: checkerTexture(), width: 1, height: 1 });
    this.setCheckerArea({ x: 0, y: 0, width: drawing.width, height: drawing.height });
    this.grids = new GridView(drawing);
    this.canvasRoot.addChild(
      this.checker,
      this.previewMask,
      this.layersRoot,
      this.grids.grid,
      this.grids.tileLines,
      this.selection.selectionDraft,
      this.selection.selection,
      this.brushCursor.cursor,
    );
    this.root.addChild(this.canvasRoot, this.brushCursor.pointerPicker);
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
    this.grids.drawGrid(camera, view);
    this.selection.setZoom(camera.zoom);
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
    this.grids.visible = !preview;
    this.selection.selection.visible = !preview;
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
    this.selection.setSelection(place, pivot, outline, handles);
  }

  /**
   * Shows the pixels a selection being made would select: those of `rect`, or those of it where
   * `mask` is 1. Null: none.
   */
  setSelectionDraft(draft: { rect: Rect; mask: Uint8Array | null } | null) {
    this.selection.setSelectionDraft(draft);
  }

  private drawCursor() {
    this.brushCursor.draw(this.cursorState, this.camera);
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
    this.grids.setGridShown(shown, tileGrid, camera, view);
  }

  /** Applies the pending changes. Call once per frame, before rendering. */
  flush() {
    this.selection.flush();
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
