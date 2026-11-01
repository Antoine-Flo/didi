// Loads the user's palettes from the app data folder, and saves them after every change.

import { PaletteLibrary, parsePaletteFile } from "$lib/core/palette";
import { readDataFile, writeDataFile } from "$lib/platform/storage";

const FILE = "palettes.json";
/** A file that could not be read is kept under this name instead of being overwritten. */
const BACKUP = "palettes-unreadable.json";
const SAVE_DELAY_MS = 300;

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
        onError(`Palettes could not be read (${message(e)}), a copy was kept in ${BACKUP}.`);
      }
    }
  } catch (e) {
    onError(`Palettes could not be loaded: ${message(e)}`);
  }
  autosave(library, onError);
  return library;
}

function autosave(library: PaletteLibrary, onError: (message: string) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const text = JSON.stringify(library.toFile(), null, 2) + "\n";
    writeDataFile(FILE, text).catch((e) => onError(`Palettes could not be saved: ${message(e)}`));
  };
  library.subscribe(() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  });
  // Changes waiting for the delay are saved when the window closes.
  window.addEventListener("beforeunload", () => {
    if (timer !== null) {
      clearTimeout(timer);
      save();
    }
  });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
