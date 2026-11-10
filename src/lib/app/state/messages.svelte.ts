// The messages shown at the bottom of the editor, stacked, the latest last. Information goes
// away after a few seconds; an error stays until the user closes it, so that another message
// cannot hide it. The same message twice in a row shows once.

export type MessageLevel = "info" | "error";

export interface Message {
  readonly id: number;
  readonly text: string;
  readonly level: MessageLevel;
}

/** The most messages shown at once: older ones make room. */
export const MAX_MESSAGES = 3;
/** How long information stays. */
export const INFO_MS = 6000;

export class Messages {
  /** The messages shown, the oldest first. */
  list = $state<readonly Message[]>([]);
  private nextId = 0;
  private timers: Record<number, ReturnType<typeof setTimeout>> = {};

  show(text: string, level: MessageLevel) {
    const last = this.list.at(-1);
    if (last?.text === text && last.level === level) {
      // Again: it stays as long as if it were new.
      this.startTimer(last);
      return;
    }
    const message = { id: this.nextId++, text, level };
    const kept = [...this.list, message];
    for (const old of kept.splice(0, Math.max(0, kept.length - MAX_MESSAGES))) {
      this.stopTimer(old.id);
    }
    this.list = kept;
    this.startTimer(message);
  }

  dismiss(id: number) {
    this.stopTimer(id);
    this.list = this.list.filter((message) => message.id !== id);
  }

  private startTimer(message: Message) {
    if (message.level !== "info") {
      return;
    }
    this.stopTimer(message.id);
    this.timers[message.id] = setTimeout(() => this.dismiss(message.id), INFO_MS);
  }

  private stopTimer(id: number) {
    clearTimeout(this.timers[id]);
    delete this.timers[id];
  }
}
