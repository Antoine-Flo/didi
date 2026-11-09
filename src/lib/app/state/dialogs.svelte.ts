// The editor's dialogs: which one is open, and the questions waiting for an answer.

import type { UnsavedChoice } from "#lib/app/files/session.svelte.js";
import type { SizeKind } from "#lib/app/ui/dialogs/ImageSizeDialog.svelte";

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

  /** A dialog is open: the menus do nothing, and the title bar is dimmed. */
  get anyOpen(): boolean {
    return (
      this.start ||
      this.commandPalette ||
      this.shortcuts ||
      this.about ||
      this.preferences ||
      this.size !== null ||
      this.grid ||
      this.unsaved !== null ||
      this.confirmRequest !== null
    );
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
