// Stamps brush dabs into a render texture, all in one render pass.
// Used by the render lab page to measure the cost of stamping.

import { Container, Sprite, Texture, type Renderer, type RenderTexture } from "pixi.js";

export interface Dab {
  x: number;
  y: number;
  size: number;
}

/** A soft round dab: white, fading out to the edge, to be tinted. */
export function makeDabTexture(): Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** A pool of sprites, one per dab, reused from one stamping to the next. */
export class DabBatch {
  private readonly batch = new Container();
  private readonly pool: Sprite[] = [];
  private poolUsed = 0;

  stamp(renderer: Renderer, target: RenderTexture, dabs: readonly Dab[], texture: Texture) {
    while (this.pool.length < dabs.length) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.tint = 0x1a1a1a;
      sprite.alpha = 0.35;
      this.pool.push(sprite);
      this.batch.addChild(sprite);
    }
    for (let i = 0; i < dabs.length; i++) {
      const dab = dabs[i];
      const sprite = this.pool[i];
      sprite.position.set(dab.x, dab.y);
      sprite.scale.set(dab.size / texture.width);
      sprite.visible = true;
    }
    for (let i = dabs.length; i < this.poolUsed; i++) {
      this.pool[i].visible = false;
    }
    this.poolUsed = dabs.length;

    renderer.render({ container: this.batch, target, clear: false });
  }
}
