// The user's theme choices (dark or light, tint, the canvas's background: see theme.ts), saved in the app data folder.
// One for the whole app: the window's layout applies it before any page is shown.

import { errorMessage } from "#lib/app/error-message.js";
import { readDataFile, writeDataFile } from "#lib/platform/storage.js";
import { m } from "#lib/paraglide/messages.js";
import {
  buildTheme,
  DEFAULT_CHOICE,
  THEME_MODES,
  type Theme,
  type ThemeChoice,
  type ThemeMode,
} from "#lib/app/shell/theme.js";

const FILE = "theme.json";
const VERSION = 1;
const SAVE_DELAY_MS = 300;

/** The choices in a saved file. Anything unexpected is ignored: they are not precious. */
export function parseThemeChoice(text: string): Partial<ThemeChoice> {
  const choice: Partial<ThemeChoice> = {};
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) return choice;
  if ("mode" in data && THEME_MODES.includes(data.mode as ThemeMode)) {
    choice.mode = data.mode as ThemeMode;
  }
  if ("tint" in data && typeof data.tint === "boolean") choice.tint = data.tint;
  if ("canvas" in data) {
    const canvas = data.canvas;
    if (canvas === null || (typeof canvas === "string" && /^#[0-9a-f]{6}$/.test(canvas))) {
      choice.canvas = canvas;
    }
  }
  return choice;
}

export class ThemePrefs {
  readonly choice = $state<ThemeChoice>({ ...DEFAULT_CHOICE });
  readonly theme: Theme = $derived(buildTheme(this.choice));
  private loaded = false;
  private changedBeforeLoad = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onError: (message: string) => void = () => {};

  set<K extends keyof ThemeChoice>(key: K, value: ThemeChoice[K]) {
    if (this.choice[key] === value) return;
    this.choice[key] = value;
    if (!this.loaded) this.changedBeforeLoad = true;
    this.scheduleSave();
  }

  /** Where saving errors are shown, once the editor can show them. */
  reportErrors(onError: (message: string) => void) {
    this.onError = onError;
  }

  /** Reads the saved choices, unless some were changed before. */
  async load(): Promise<void> {
    try {
      const text = await readDataFile(FILE);
      if (text !== null && !this.changedBeforeLoad) {
        Object.assign(this.choice, parseThemeChoice(text));
      }
    } catch {
      // An unreadable file only loses the choices: keep the default theme.
    }
    this.loaded = true;
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  async flush(): Promise<void> {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    await this.save();
  }

  private scheduleSave() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  private async save() {
    this.timer = null;
    // Before loading, saving would overwrite the file: try again later.
    if (!this.loaded) return this.scheduleSave();
    const text = JSON.stringify({ version: VERSION, ...this.choice }, null, 2) + "\n";
    try {
      await writeDataFile(FILE, text);
    } catch (e) {
      this.onError(m.app_theme_save_failed({ error: errorMessage(e) }));
    }
  }
}

export const themePrefs = new ThemePrefs();
