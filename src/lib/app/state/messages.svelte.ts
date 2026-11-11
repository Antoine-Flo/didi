// The messages shown at the bottom of the editor, stacked, the latest last. Information goes
// away after a few seconds; an error stays until the user closes it, so that another message
// cannot hide it, and so does a message with a button (e.g. "Update"). The same message twice
// in a row shows once.

export type MessageLevel = "info" | "error";

/** A button in a message: pressing it closes the message, then runs `run`. */
export interface MessageAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Message {
  readonly id: number;
  readonly text: string;
  readonly level: MessageLevel;
  readonly action?: MessageAction;
}

/** Whether a message stays until closed, and so has a button for it. */
export const staysUntilClosed = (message: Message) =>
  message.level === "error" || message.action !== undefined;

/** The most messages shown at once: older ones make room. */
export const MAX_MESSAGES = 3;
/** How long information stays. */
export const INFO_MS = 6000;

export class Messages {
  /** The messages shown, the oldest first. */
  list = $state<readonly Message[]>([]);
  private nextId = 0;
  private timers: Record<number, ReturnType<typeof setTimeout>> = {};

  show(text: string, level: MessageLevel, action?: MessageAction) {
    const last = this.list.at(-1);
    if (last?.text === text && last.level === level) {
      // Again: it stays as long as if it were new.
      this.startTimer(last);
      return;
    }
    const message: Message = { id: this.nextId++, text, level, action };
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

  /** Presses the message's button: it closes, and its action runs. */
  act(id: number) {
    const action = this.list.find((message) => message.id === id)?.action;
    this.dismiss(id);
    action?.run();
  }

  private startTimer(message: Message) {
    if (staysUntilClosed(message)) {
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
