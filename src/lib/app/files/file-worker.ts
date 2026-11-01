// Runs the slow file work (PNG encoding and decoding, zip) away from the interface.
// See files.ts for the side that calls it.

import * as Comlink from "comlink";
import {
  flattenDocument,
  readDidi,
  readDidiThumbnail,
  thumbnail,
  writeDidi,
  type DocumentData,
} from "#lib/core/file/didi-file.js";
import { encodePng } from "#lib/core/file/png.js";

/** The buffers of a document's tiles, to transfer them instead of copying. */
function tileBuffers(doc: DocumentData): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const layer of doc.layers) {
    for (const tile of layer.tiles.values()) if (tile) buffers.push(tile.buffer as ArrayBuffer);
  }
  return buffers;
}

const api = {
  /** The .didi file, and its preview (PNG) for the recent files. */
  save(doc: DocumentData): { file: Uint8Array; thumbnail: Uint8Array } {
    const preview = encodePng(thumbnail(doc));
    const file = writeDidi(doc, preview);
    return Comlink.transfer({ file, thumbnail: preview }, [file.buffer as ArrayBuffer]);
  },

  /** The document, and the preview stored in the file (null if there is none). */
  load(bytes: Uint8Array): { doc: DocumentData; thumbnail: Uint8Array | null } {
    const doc = readDidi(bytes);
    return Comlink.transfer({ doc, thumbnail: readDidiThumbnail(bytes) }, tileBuffers(doc));
  },

  /** The visible layers merged into one PNG. */
  exportPng(doc: DocumentData): Uint8Array {
    const png = encodePng({ width: doc.width, height: doc.height, data: flattenDocument(doc) });
    return Comlink.transfer(png, [png.buffer as ArrayBuffer]);
  },
};

export type FileWorker = typeof api;

Comlink.expose(api);
