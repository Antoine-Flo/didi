// A JSON file in the app data folder (preferences, colors, palettes), saved a moment after
// the last change rather than at each one, and never before it has been read: saving first
// would overwrite the user's file with the defaults. Reading and checking its contents stay
// with each owner, which knows what they mean.

import { errorMessage } from "#lib/app/shared/error-message.js";
import { readDataFile, writeDataFile } from "#lib/platform/storage.js";

export const SAVE_DELAY_MS = 300;

export interface DataFileOptions {
  /** What to save, turned into JSON when saving. */
  content: () => unknown;
  /** The message for the user when saving fails. */
  saveFailed: (error: string) => string;
}

export class DataFile {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private read = false;
  /** Where saving errors are shown. */
  onError: (message: string) => void = () => {};

  constructor(
    readonly name: string,
    private readonly options: DataFileOptions,
  ) {}

  /** Whether the file has been read: until then, changes wait to be saved. */
  get loaded(): boolean {
    return this.read;
  }

  /** The file's text, or null if it does not exist yet. */
  load(): Promise<string | null> {
    return readDataFile(this.name);
  }

  /** The file was read (or could not be): saving may start. */
  markLoaded() {
    this.read = true;
  }

  /** Saves after the delay, or later if the file is not read yet. */
  scheduleSave() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  async flush(): Promise<void> {
    if (this.timer === null) {
      return;
    }
    clearTimeout(this.timer);
    await this.save();
  }

  private async save() {
    this.timer = null;
    if (!this.read) {
      return this.scheduleSave();
    }
    const text = JSON.stringify(this.options.content(), null, 2) + "\n";
    try {
      await writeDataFile(this.name, text);
    } catch (e) {
      this.onError(this.options.saveFailed(errorMessage(e)));
    }
  }
}
