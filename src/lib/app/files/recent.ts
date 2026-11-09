// Recently opened or saved documents, for the start screen: recent.json in the app data
// folder, with a small preview of each document.

import { readDataFile, writeDataFile } from "#lib/platform/storage.js";

export interface RecentFile {
  path: string;
  name: string;
  /** PNG preview, as a data URL. */
  thumbnail: string;
  /** When it was last opened or saved, in ms since 1970. */
  time: number;
  /** The document's mode, e.g. "pixel" (missing in lists from before modes). */
  mode?: string;
}

interface RecentJson {
  version: 1;
  files: RecentFile[];
}

const FILE = "recent.json";
export const MAX_RECENT = 8;

/** The list with `file` first, without duplicates, at most MAX_RECENT long. */
export function withRecent(list: readonly RecentFile[], file: RecentFile): RecentFile[] {
  return [file, ...list.filter((f) => f.path !== file.path)].slice(0, MAX_RECENT);
}

/** Reads the saved list. Entries that are not valid are dropped. */
export function parseRecent(text: string): RecentFile[] {
  try {
    const json = JSON.parse(text) as Partial<RecentJson>;
    if (json.version !== 1 || !Array.isArray(json.files)) {
      return [];
    }
    return json.files
      .filter(
        (f) =>
          typeof f?.path === "string" &&
          typeof f.name === "string" &&
          typeof f.thumbnail === "string" &&
          typeof f.time === "number" &&
          (f.mode === undefined || typeof f.mode === "string"),
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export async function loadRecent(): Promise<RecentFile[]> {
  const text = await readDataFile(FILE);
  return text === null ? [] : parseRecent(text);
}

export async function saveRecent(files: readonly RecentFile[]): Promise<void> {
  const json: RecentJson = { version: 1, files: [...files] };
  await writeDataFile(FILE, JSON.stringify(json));
}
