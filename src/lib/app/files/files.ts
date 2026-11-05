// Saving, opening and exporting documents: the slow work runs in a worker (file-worker.ts),
// reading and writing files goes through the platform layer.

import * as Comlink from "comlink";
import type { DocumentData } from "#lib/core/file/didi-file.js";
import { readFile, writeFile } from "#lib/platform/storage.js";
import type { FileWorker } from "./file-worker";

let worker: Comlink.Remote<FileWorker> | null = null;

function files(): Comlink.Remote<FileWorker> {
  worker ??= Comlink.wrap<FileWorker>(
    new Worker(new URL("./file-worker.ts", import.meta.url), { type: "module" }),
  );
  return worker;
}

/** A .didi file for the document, and its preview (PNG). Tiles are copied, not moved. */
export function encodeDocument(doc: DocumentData) {
  return files().save(doc);
}

/** Reads a .didi file. Throws with a message for the user if it cannot be read. */
export function decodeDocument(bytes: Uint8Array) {
  return files().load(Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]));
}

/** Saves the document. Returns its preview (PNG). */
export async function saveDocument(path: string, doc: DocumentData): Promise<Uint8Array> {
  const { file, thumbnail } = await encodeDocument(doc);
  await writeFile(path, file);
  return thumbnail;
}

export async function openDocument(path: string) {
  return decodeDocument(await readFile(path));
}

/** The document flattened, as a PNG. */
export function renderPng(doc: DocumentData) {
  return files().exportPng(doc);
}

export async function exportPng(path: string, doc: DocumentData): Promise<void> {
  await writeFile(path, await renderPng(doc));
}

/** PNG bytes as a data URL, for an <img>. */
export function pngDataUrl(png: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < png.length; i += 0x8000) {
    binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/** "drawing.didi" for "/home/me/drawing.didi". */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** "drawing" for "/home/me/drawing.didi". */
export function documentName(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "");
}
