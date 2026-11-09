// The selection over the canvas: its moving outline with its handles, and the pixels a
// selection being made would select.

import { BufferImageSource, Graphics, Sprite, Texture } from "pixi.js";
import type { Rect } from "#lib/core/shared/geometry.js";
import { selectionHandles } from "#lib/core/selection/handles.js";
import { corners, toCanvas, type Placement, type Point } from "#lib/core/selection/placement.js";
import type { OutlineRun } from "#lib/core/selection/shape.js";
import { CONTRAST_BLEND } from "#lib/render/contrast-blend.js";

export class SelectionView {
  /** The selection's outline and handles, on the canvas. */
  readonly selection = new Graphics();
  /** The exact pixels a selection being made would select, over the layers. */
  readonly selectionDraft = new Sprite();
  private selectionPlace: Placement | null = null;
  private selectionPivot: Point | null = null;
  /** A lasso's outline, in pixels of its box. Null: the box itself. */
  private selectionOutline: OutlineRun[] | null = null;
  private selectionHasHandles = false;
  /** Which dashes of the moving outline are drawn: changes a few times per second. */
  private dashPhase = 0;
  private zoom = 1;

  constructor() {
    this.selectionDraft.blendMode = CONTRAST_BLEND;
    this.selectionDraft.visible = false;
  }

  /** Redraws the outline for a new zoom: its lines and handles keep their size on screen. */
  setZoom(zoom: number) {
    this.zoom = zoom;
    this.drawSelection();
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

  /** Moves the outline's dashes, when it is their time. Call once per frame. */
  flush() {
    if (this.selectionPlace) {
      const phase = Math.floor(performance.now() / 150) % 2;
      if (phase !== this.dashPhase) {
        this.dashPhase = phase;
        this.drawSelection();
      }
    }
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
}
