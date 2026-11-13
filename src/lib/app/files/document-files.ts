// The files of the open document (see Session): which .didi file to open or save to, where a
// PNG export goes, and the recent files' entry of a saved document.

import type { DocumentData } from "#lib/core/file/didi-file.js";
import {
  canUseFiles,
  chooseBrowserFile,
  chooseFileToOpen,
  chooseFileToSave,
} from "#lib/platform/storage.js";
import { documentName, exportPng, fileName, pngDataUrl, renderPng } from "#lib/app/files/files.js";
import type { RecentFile } from "#lib/app/files/recent.js";
import { m } from "#lib/paraglide/messages.js";

const didiFilter = () => [{ name: m.files_didi_filter(), extensions: ["didi"] }];

const pngFilter = () => [{ name: m.files_png_filter(), extensions: ["png"] }];

/** Asks for a .didi file to open. Null if the user cancels. */
export function chooseDidiToOpen(): Promise<string | null> {
  return chooseFileToOpen(didiFilter());
}

/** Asks where to save a .didi file, from `suggested`. Null if the user cancels. */
export async function chooseDidiToSave(suggested: string): Promise<string | null> {
  let path = await chooseFileToSave(suggested, didiFilter());
  if (!path) {
    return null;
  }
  if (!/\.didi$/i.test(path)) {
    path += ".didi";
  }
  return path;
}

/** Where a PNG export goes: its file's name, and how to write a document there. */
export interface PngExport {
  name: string;
  write(doc: DocumentData): Promise<void>;
}

/** Asks where to export the document `name` as PNG. Null if the user cancels. */
export async function choosePngExport(name: string): Promise<PngExport | null> {
  if (!canUseFiles()) {
    return downloadPng(name);
  }
  let path = await chooseFileToSave(`${name}.png`, pngFilter());
  if (!path) {
    return null;
  }
  if (!/\.png$/i.test(path)) {
    path += ".png";
  }
  const target = path;
  return { name: fileName(target), write: (doc) => exportPng(target, doc) };
}

/** In a browser, which has no paths: it writes where the user chose. */
async function downloadPng(title: string): Promise<PngExport | null> {
  const name = `${title}.png`;
  const write = await chooseBrowserFile(name, "image/png", ".png");
  if (!write) {
    return null;
  }
  return { name, write: async (doc) => write(await renderPng(doc)) };
}

/** The recent files' entry of a document saved or opened at `path`, now. */
export function recentFile(path: string, thumbnail: Uint8Array): RecentFile {
  return {
    path,
    name: documentName(path),
    thumbnail: pngDataUrl(thumbnail),
    time: Date.now(),
  };
}
