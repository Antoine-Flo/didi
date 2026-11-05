// Files: app data files (palettes, recent files, recovery…) in the app data folder, and
// the user's documents. See src-tauri/src/storage.rs.
//
// In a plain browser (dev server, lab), text data files fall back to localStorage; binary
// data files and user files need the desktop app.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { capabilities } from "./capabilities";

const PREFIX = "didi:";

/** The contents of a data file, or null if it does not exist yet. */
export async function readDataFile(name: string): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("data_read", { name });
  return localStorage.getItem(PREFIX + name);
}

export async function writeDataFile(name: string, contents: string): Promise<void> {
  if (isTauri()) return invoke("data_write", { name, contents });
  localStorage.setItem(PREFIX + name, contents);
}

/** The bytes of a data file, or null if it does not exist (or outside the desktop app). */
export async function readDataBytes(name: string): Promise<Uint8Array | null> {
  if (!isTauri()) return null;
  try {
    return new Uint8Array(await invoke<ArrayBuffer>("data_read_bytes", { name }));
  } catch (e) {
    if (e === "NotFound") return null;
    throw e;
  }
}

/** Writes a binary data file. Does nothing outside the desktop app. */
export async function writeDataBytes(name: string, bytes: Uint8Array): Promise<void> {
  if (!isTauri()) return;
  await invoke("data_write_bytes", bytes, { headers: { name: encodeURIComponent(name) } });
}

export async function removeDataFile(name: string): Promise<void> {
  if (isTauri()) await invoke("data_remove", { name });
  else localStorage.removeItem(PREFIX + name);
}

/** Whether user files can be opened and saved (desktop app only). */
export const canUseFiles = () => capabilities.userFiles;

/** Where a file goes in a browser: writes it there. */
export type BrowserFile = (bytes: Uint8Array) => Promise<void>;

/** Not in every browser (Chromium only so far), so not in TypeScript's types. */
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/**
 * In a browser, asks where to save a file. Null if cancelled. Call it right after the user's
 * action, before any long work: browsers only open the dialog then. Where they cannot (other
 * browsers, a page embedded in another site), the file goes to the downloads, without asking.
 */
export async function chooseBrowserFile(
  name: string,
  type: string,
  extension: string,
): Promise<BrowserFile | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker) return async (bytes) => download(name, bytes, type);
  try {
    const handle = await picker({
      suggestedName: name,
      types: [{ accept: { [type]: [extension] } }],
    });
    return async (bytes) => {
      const file = await handle.createWritable();
      await file.write(bytes as Uint8Array<ArrayBuffer>);
      await file.close();
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    return async (bytes) => download(name, bytes, type);
  }
}

function download(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Later: the browser may still be reading it.
  setTimeout(() => URL.revokeObjectURL(url));
}

export async function readFile(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("file_read", { path }));
}

/** Writes a user file atomically: a crash never leaves a half-written file. */
export async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("file_write", bytes, { headers: { path: encodeURIComponent(path) } });
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Asks for a file to open. Null if cancelled. */
export async function chooseFileToOpen(filters: FileFilter[]): Promise<string | null> {
  const path = await open({ multiple: false, directory: false, filters });
  return typeof path === "string" ? path : null;
}

/** Asks where to save a file. Null if cancelled. */
export async function chooseFileToSave(
  defaultPath: string,
  filters: FileFilter[],
): Promise<string | null> {
  return (await save({ defaultPath, filters })) ?? null;
}
