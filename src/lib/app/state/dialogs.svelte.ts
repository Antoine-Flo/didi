// The editor's dialogs: which one is open, and the questions waiting for an answer.

import type { UnsavedChoice } from "#lib/app/files/session.svelte.js";

/** Which size the size dialog changes: the canvas (cut or extend) or the image (scale). */
export type SizeKind = "canvas" | "image";

/** The dialogs the commands open. */
export type DialogName =
  | "start"
  | "commandPalette"
  | "shortcuts"
  | "about"
  | "preferences"
  | "grid"
  | "canvasSize"
  | "imageSize";

export interface ConfirmQuestion {
  title: string;
  text: string;
  action: string;
}

export class EditorDialogs {
  /** The start screen: like Blender's splash screen. */
  start = $state(false);
  commandPalette = $state(false);
  shortcuts = $state(false);
  about = $state(false);
  preferences = $state(false);
  grid = $state(false);
  /** What changed in the newer versions, above the start screen (see UpdateOffer). */
  whatsNew = $state(false);
  /** The image or canvas size dialog. */
  size = $state<SizeKind | null>(null);
  /** What to do with unsaved changes (see UnsavedDialog). */
  unsaved = $state<{ name: string; answer: (choice: UnsavedChoice) => void } | null>(null);
  /** The pending confirmation (see ConfirmDialog), answered once. */
  confirmRequest = $state<(ConfirmQuestion & { onconfirm: () => void }) | null>(null);
  private answerConfirm: (confirmed: boolean) => void = () => {};

  constructor(startOpen: boolean) {
    this.start = startOpen;
  }

  /** A dialog is open: the menus do nothing. */
  get anyOpen(): boolean {
    return this.preferences || this.dimLayers > 0;
  }

  /**
   * How many dialogs dim what is behind them: one above another (What's new above the start
   * screen) dims it too. The title bar takes as many layers. Not the preferences: the whole
   * interface is seen while choosing its look.
   */
  get dimLayers(): number {
    return [
      this.start,
      this.commandPalette,
      this.shortcuts,
      this.about,
      this.size !== null,
      this.grid,
      this.whatsNew,
      this.unsaved !== null,
      this.confirmRequest !== null,
    ].filter(Boolean).length;
  }

  open(name: DialogName) {
    if (name === "canvasSize" || name === "imageSize") {
      this.size = name === "canvasSize" ? "canvas" : "image";
    } else {
      this[name] = true;
    }
  }

  /** Asks what to do with a document's unsaved changes. */
  askUnsaved(name: string): Promise<UnsavedChoice> {
    return new Promise((resolve) => {
      this.unsaved = {
        name,
        answer: (choice) => {
          this.unsaved = null;
          resolve(choice);
        },
      };
    });
  }

  /** Asks to confirm an action. A question still waiting is answered no. */
  confirm(question: ConfirmQuestion): Promise<boolean> {
    this.answerConfirm(false);
    return new Promise<boolean>((resolve) => {
      this.answerConfirm = resolve;
      this.confirmRequest = { ...question, onconfirm: () => resolve(true) };
    });
  }

  /** The confirmation closed: no, unless it was confirmed first. */
  closeConfirm() {
    this.confirmRequest = null;
    this.answerConfirm(false);
  }
}
