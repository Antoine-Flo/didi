import type { Editor } from "$lib/core/editor";
import { writePixels } from "$lib/core/edits";
import { premultiply } from "$lib/core/pixels";

export interface DecodedImage {
  width: number;
  height: number;
  /** Premultiplied RGBA. */
  data: Uint8ClampedArray;
}

/** Decodes an image file (PNG, JPEG, WebP…) into premultiplied pixels. */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: premultiply(data) };
}

/** Adds the image as a new layer, centered, as one undo step. */
export function importImage(editor: Editor, image: DecodedImage, name: string) {
  const { drawing, history } = editor;
  const rect = {
    x: Math.floor((drawing.width - image.width) / 2),
    y: Math.floor((drawing.height - image.height) / 2),
    width: image.width,
    height: image.height,
  };
  history.begin("Importer une image");
  try {
    editor.commands.execute("layer.add", { props: { name } });
    history.push(writePixels(editor.activeLayer!.id, rect, image.data, "Importer une image"));
  } finally {
    history.end();
  }
}
