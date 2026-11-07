// Copy and paste. What is copied goes to the system clipboard (other apps can paste it), and
// is kept here too, exact (premultiplied, with its place): pasted back in Didi, it comes back
// where it was taken, without the loss of a round trip through straight pixels. An image
// copied elsewhere since then wins, pasted in the middle of the canvas.

import type { Editor, Image } from "#lib/core/editor/editor.js";
import { premultiply, unpremultiply } from "#lib/core/document/pixels.js";
import { readClipboardImage, writeClipboardImage } from "#lib/platform/clipboard.js";

/** The last copy, kept from one document to the next. */
let copied: (Image & { x: number; y: number }) | null = null;

/** Copies the selected pixels, or the whole active layer. False if there is none. */
export async function copy(editor: Editor): Promise<boolean> {
  const image = editor.copyImage();
  if (!image) return false;
  const { rect, ...pixels } = image;
  copied = { ...pixels, x: rect.x, y: rect.y };
  const { width, height } = image;
  await writeClipboardImage({ width, height, data: unpremultiply(image.pixels) });
  return true;
}

/**
 * The image to paste and where: the system clipboard's (centered), or Didi's own copy if it
 * is the same size (most likely it, as copied). Null if there is nothing to paste.
 */
export async function toPaste(
  editor: Editor,
): Promise<{ image: Image; at: { x: number; y: number } } | null> {
  let image: Image | null = null;
  try {
    const system = await readClipboardImage();
    if (system)
      image = { width: system.width, height: system.height, pixels: premultiply(system.data) };
  } catch {
    // Refused or unavailable: Didi's own copy.
  }
  if (copied && (!image || (image.width === copied.width && image.height === copied.height))) {
    return { image: copied, at: { x: copied.x, y: copied.y } };
  }
  if (!image) return null;
  const { drawing } = editor;
  const at = {
    x: Math.floor((drawing.width - image.width) / 2),
    y: Math.floor((drawing.height - image.height) / 2),
  };
  return { image, at };
}
