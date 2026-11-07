// The system clipboard, for images: shared with the other apps (a screenshot, GIMP, a chat).
// The desktop app goes through the Tauri plugin, as the webview's clipboard is not reliable;
// a browser through its Clipboard API, as a PNG (it may ask the user's permission to read).

import { isTauri } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { readImage, writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { encodePng } from "#lib/core/file/png.js";

/** Straight (not premultiplied) RGBA, row by row. */
export interface ClipboardImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export async function writeClipboardImage(image: ClipboardImage): Promise<void> {
  if (isTauri()) {
    const rgba = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length);
    await writeImage(await Image.new(rgba, image.width, image.height));
    return;
  }
  const png = encodePng(image);
  const blob = new Blob([png.slice()], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** The image in the clipboard, or null if there is none (text, nothing). */
export async function readClipboardImage(): Promise<ClipboardImage | null> {
  if (isTauri()) {
    let image: Image;
    try {
      image = await readImage();
    } catch {
      return null;
    }
    const { width, height } = await image.size();
    return { width, height, data: new Uint8ClampedArray(await image.rgba()) };
  }
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return decode(await item.getType(type));
  }
  return null;
}

async function decode(blob: Blob): Promise<ClipboardImage> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}
