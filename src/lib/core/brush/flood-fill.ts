// The paint bucket's area: the pixels of the same color as the clicked one, like Aseprite.
// Colors are compared on the layer's own pixels (premultiplied RGBA), channel by channel.

import type { Rect } from "../geometry";

export interface FillOptions {
  /** Largest difference allowed on each channel, 0 (exact color) to 255. */
  tolerance: number;
  /** Only the pixels connected to the clicked one (by their sides), not every match. */
  contiguous: boolean;
}

/**
 * The area to fill from pixel (x, y) in `data` (width × height, RGBA): a mask (1 = fill)
 * and the box around it, or null if (x, y) is outside.
 */
export function fillArea(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  { tolerance, contiguous }: FillOptions,
): { mask: Uint8Array; bounds: Rect } | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const start = (y * width + x) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const matches = (i: number) => {
    const j = i * 4;
    return (
      Math.abs(data[j] - target[0]) <= tolerance &&
      Math.abs(data[j + 1] - target[1]) <= tolerance &&
      Math.abs(data[j + 2] - target[2]) <= tolerance &&
      Math.abs(data[j + 3] - target[3]) <= tolerance
    );
  };

  const mask = new Uint8Array(width * height);
  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;
  const mark = (i: number) => {
    mask[i] = 1;
    const px = i % width;
    const py = (i - px) / width;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };

  if (!contiguous) {
    for (let i = 0; i < width * height; i++) if (matches(i)) mark(i);
  } else {
    // Scanline fill: each popped pixel fills its whole row segment, then queues the rows
    // above and below.
    const stack = [y * width + x];
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (mask[i] || !matches(i)) continue;
      const row = i - (i % width);
      let left = i;
      while (left > row && !mask[left - 1] && matches(left - 1)) left--;
      let right = i;
      while (right < row + width - 1 && !mask[right + 1] && matches(right + 1)) right++;
      for (let j = left; j <= right; j++) {
        mark(j);
        if (j >= width && !mask[j - width]) stack.push(j - width);
        if (j < width * (height - 1) && !mask[j + width]) stack.push(j + width);
      }
    }
  }
  return {
    mask,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}
