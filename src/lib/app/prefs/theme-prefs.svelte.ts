// The user's theme choices (dark or light, tint, the canvas's background: see theme.ts), saved in the app data folder.
// One for the whole app: the window's layout applies it before any page is shown.

import { DataFile } from "#lib/app/shared/data-file.js";
import { m } from "#lib/paraglide/messages.js";
import {
  buildTheme,
  DEFAULT_CHOICE,
  THEME_MODES,
  type Theme,
  type ThemeChoice,
  type ThemeMode,
} from "#lib/app/prefs/theme.js";

const VERSION = 1;

/** The choices in a saved file. Anything unexpected is ignored: they are not precious. */
export function parseThemeChoice(text: string): Partial<ThemeChoice> {
  const choice: Partial<ThemeChoice> = {};
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) {
    return choice;
  }
  if ("mode" in data && THEME_MODES.includes(data.mode as ThemeMode)) {
    choice.mode = data.mode as ThemeMode;
  }
  if ("tint" in data && typeof data.tint === "boolean") {
    choice.tint = data.tint;
  }
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
  private changedBeforeLoad = false;
  private readonly file = new DataFile("theme.json", {
    content: () => ({ version: VERSION, ...this.choice }),
    saveFailed: (error) => m.app_theme_save_failed({ error }),
  });

  set<K extends keyof ThemeChoice>(key: K, value: ThemeChoice[K]) {
    if (this.choice[key] === value) {
      return;
    }
    this.choice[key] = value;
    if (!this.file.loaded) {
      this.changedBeforeLoad = true;
    }
    this.file.scheduleSave();
  }

  /** Where saving errors are shown, once the editor can show them. */
  reportErrors(onError: (message: string) => void) {
    this.file.onError = onError;
  }

  /** Reads the saved choices, unless some were changed before. */
  async load(): Promise<void> {
    try {
      const text = await this.file.load();
      if (text !== null && !this.changedBeforeLoad) {
        Object.assign(this.choice, parseThemeChoice(text));
      }
    } catch {
      // An unreadable file only loses the choices: keep the default theme.
    }
    this.file.markLoaded();
  }

  /** Saves now the changes waiting for the delay, if any: call before the app closes. */
  flush(): Promise<void> {
    return this.file.flush();
  }
}

export const themePrefs = new ThemePrefs();
