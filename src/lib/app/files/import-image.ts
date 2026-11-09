import { errorMessage } from "#lib/app/shared/error-message.js";
import { parseHexPalette, type PaletteLibrary } from "#lib/core/color/palette.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { writePixels } from "#lib/core/history/edits.js";
import { premultiply } from "#lib/core/document/pixels.js";
import { m } from "#lib/paraglide/messages.js";

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
  history.begin(m.files_import_image_undo());
  try {
    editor.commands.execute("layer.add", { props: { name } });
    history.push(
      writePixels(editor.activeLayer!.id, rect, image.data, m.files_import_image_undo()),
    );
  } finally {
    history.end();
  }
}

/** Imports images as layers and .hex files as palettes (once the palettes are loaded). */
export async function importFiles(
  editor: Editor,
  palettes: PaletteLibrary | null,
  files: Iterable<File>,
  notify: (message: string) => void,
) {
  for (const file of files) {
    if (/\.hex$/i.test(file.name)) {
      await importPalette(palettes, file, notify);
      continue;
    }
    if (!file.type.startsWith("image/")) {
      continue;
    }
    try {
      importImage(editor, await decodeImage(file), baseName(file.name));
    } catch (e) {
      notify(m.editor_cannot_import({ name: file.name, error: errorMessage(e) }));
    }
  }
}

/** Adds a .hex file to the palettes (once they are loaded). */
export async function importPalette(
  palettes: PaletteLibrary | null,
  file: File,
  notify: (message: string) => void,
) {
  if (!palettes) {
    return;
  }
  try {
    palettes.add(parseHexPalette(await file.text(), baseName(file.name)));
  } catch (e) {
    notify(m.editor_cannot_import({ name: file.name, error: errorMessage(e) }));
  }
}

/** A file's name without its extension. */
const baseName = (name: string) => name.replace(/\.[^.]+$/, "");
