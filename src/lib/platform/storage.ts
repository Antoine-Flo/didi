// User data files (palettes…): the app data folder in Tauri (see src-tauri/src/storage.rs),
// localStorage in a plain browser (dev server, lab).

import { invoke, isTauri } from "@tauri-apps/api/core";

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
