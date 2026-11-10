// Loads the user's palettes from the app data folder, and saves them after every change.

import { PaletteLibrary, parsePaletteFile } from "#lib/core/color/palette.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import { DataFile } from "#lib/app/shared/data-file.js";
import { readDataFile, writeDataFile } from "#lib/platform/storage.js";
import { m } from "#lib/paraglide/messages.js";

const FILE = "palettes.json";
/** A file that could not be read is kept under this name instead of being overwritten. */
const BACKUP = "palettes-unreadable.json";

/** Saves now the changes waiting for the delay, if any. */
let flush: () => Promise<void> = async () => {};

/** Saves the palettes' pending changes now: call before the app closes. */
export function flushPalettes(): Promise<void> {
  return flush();
}

/**
 * The saved library, or the default one the first time. `onError` receives a message for
 * the user if the file cannot be read or saved.
 */
export async function loadPalettes(onError: (message: string) => void): Promise<PaletteLibrary> {
  let library = new PaletteLibrary();
  try {
    const text = await readDataFile(FILE);
    if (text !== null) {
      try {
        const { palettes, active } = parsePaletteFile(text);
        library = new PaletteLibrary(palettes, active);
      } catch (e) {
        await writeDataFile(BACKUP, text);
        onError(m.files_palettes_unreadable({ error: errorMessage(e), backup: BACKUP }));
      }
    }
  } catch (e) {
    onError(m.files_palettes_load_failed({ error: errorMessage(e) }));
  }
  autosave(library, onError);
  return library;
}

function autosave(library: PaletteLibrary, onError: (message: string) => void) {
  const file = new DataFile(FILE, {
    content: () => library.toFile(),
    saveFailed: (error) => m.files_palettes_save_failed({ error }),
  });
  file.onError = onError;
  // Only made once the file is read.
  file.markLoaded();
  library.subscribe(() => file.scheduleSave());
  flush = () => file.flush();
}
