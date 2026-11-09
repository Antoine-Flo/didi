// One layer of a drawing, shown with PixiJS: a sprite per non-empty tile (see drawing-view.ts).

import {
  BufferImageSource,
  Container,
  Sprite,
  Texture,
  type BLEND_MODES as PixiBlendMode,
  type SCALE_MODE,
} from "pixi.js";
import type { BlendMode, ReadonlyLayer } from "#lib/core/document/layer.js";
import { TILE_SIZE, tileCoord } from "#lib/core/document/tiles.js";
import type { Rect } from "#lib/core/shared/geometry.js";

const PIXI_BLEND: Record<BlendMode, PixiBlendMode> = {
  normal: "normal",
  screen: "screen",
  add: "add",
};

export class LayerView {
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
