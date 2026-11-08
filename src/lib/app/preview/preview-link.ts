// The preview shows the whole drawing, flattened: over the canvas (pop-in), or in a window
// of its own that can go to another screen (pop-out). The editor sends it the image, the
// parts that changed at most once per frame, and all of it when the preview opens or the
// document changes. Windows do not share memory: to a window, over a BroadcastChannel.

import type { Drawing, DrawingChange } from "#lib/core/document/drawing.js";
import { composite } from "#lib/core/document/compositing.js";
import { unpremultiply } from "#lib/core/document/pixels.js";
import { TILE_SIZE, tileCoord } from "#lib/core/document/tiles.js";
import { intersect, union, type Rect } from "#lib/core/geometry.js";

const CHANNEL = "didi-preview";

/** From the editor to the preview. Pixels are straight RGBA, ready for an ImageData. */
export type ToPreview =
  | { type: "size"; width: number; height: number }
  | { type: "pixels"; rect: Rect; data: Uint8ClampedArray };

/** From the preview to the editor: it has just opened and needs the whole image. */
export type FromPreview = { type: "hello" };

export function previewChannel(): BroadcastChannel {
  return new BroadcastChannel(CHANNEL);
}

/**
 * The part of the drawing a change affects, in canvas pixels. Pixels change in their tiles'
 * areas; anything else (a layer added, hidden, moved…) can change the whole image.
 */
export function changedRect(change: DrawingChange, drawing: Drawing): Rect | null {
  const all = { x: 0, y: 0, width: drawing.width, height: drawing.height };
  if (change.type !== "pixels-changed") return all;
  let rect: Rect | null = null;
  change.tiles.forEach((key, i) => {
    const { tx, ty } = tileCoord(key);
    const area = change.areas?.[i] ?? { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE };
    const part = {
      x: tx * TILE_SIZE + area.x,
      y: ty * TILE_SIZE + area.y,
      width: area.width,
      height: area.height,
    };
    rect = rect ? union(rect, part) : part;
  });
  return rect && intersect(rect, all);
}

/** Sends a drawing to the preview window, over the channel. Returns a function that stops. */
export function sendToWindow(drawing: Drawing): () => void {
  const channel = previewChannel();
  const sender = new PreviewSender(drawing, (message) => channel.postMessage(message));
  channel.onmessage = (e: MessageEvent<FromPreview>) => {
    if (e.data.type === "hello") sender.sendAll();
  };
  return () => {
    sender.close();
    channel.close();
  };
}

/** The editor's side: follows a drawing and sends what changes, while the preview is open. */
export class PreviewSender {
  private dirty: Rect | null = null;
  private frame = 0;
  private unsubscribe: () => void;

  constructor(
    private drawing: Drawing,
    private post: (message: ToPreview) => void,
  ) {
    this.unsubscribe = drawing.subscribe((change) => {
      // A new size: the whole image again, with its size.
      if (change.type === "canvas-resized") return this.sendAll();
      const rect = changedRect(change, drawing);
      if (rect) this.invalidate(rect);
    });
    this.sendAll();
  }

  close() {
    this.unsubscribe();
    cancelAnimationFrame(this.frame);
  }

  /** The whole image again. */
  sendAll() {
    const { width, height } = this.drawing;
    cancelAnimationFrame(this.frame);
    this.dirty = null;
    this.post({ type: "size", width, height });
    this.invalidate({ x: 0, y: 0, width, height });
  }

  private invalidate(rect: Rect) {
    if (this.dirty) {
      this.dirty = union(this.dirty, rect);
      return;
    }
    this.dirty = rect;
    this.frame = requestAnimationFrame(() => {
      const dirty = this.dirty;
      this.dirty = null;
      if (!dirty) return;
      const data = unpremultiply(composite(this.drawing, dirty));
      this.post({ type: "pixels", rect: dirty, data });
    });
  }
}
