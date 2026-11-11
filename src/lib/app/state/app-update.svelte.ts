// The app's update, in the builds that update themselves. At start, a newer version is
// offered at the top of the start screen; if the start screen is already closed, in a
// message with an "Update" button, which stays until pressed or closed. Updating downloads
// the version (with its progress), offers to save the unsaved changes as when quitting, then
// installs it and starts the app again.

import { notesSince, type ReleaseNotes } from "#lib/app/files/release-notes.js";
import type { MessageAction, MessageLevel } from "#lib/app/state/messages.svelte.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import { m } from "#lib/paraglide/messages.js";
import type { AvailableUpdate } from "#lib/platform/updater.js";

export interface UpdateHost {
  /** A newer version, if there is one and this build updates itself. */
  find(): Promise<AvailableUpdate | null>;
  /** The start screen is open: the update shows there rather than in a message. */
  startScreenOpen(): boolean;
  notify(text: string, level: MessageLevel, action?: MessageAction): void;
  /** As before quitting: offers to save, writes what is pending. False if the user cancels. */
  prepareToQuit(): Promise<boolean>;
  restart(): Promise<void>;
}

/** The newer version offered. */
export interface UpdateOffer {
  version: string;
  currentVersion: string;
  /** What changed since the version running, the newest first. */
  releases: ReleaseNotes[];
}

export class AppUpdate {
  /** The newer version offered, if any. */
  offer = $state<UpdateOffer | null>(null);
  /** The update in progress (downloading, installing), or null. */
  busy = $state<string | null>(null);
  private update: AvailableUpdate | null = null;
  private downloaded = false;

  constructor(private readonly host: UpdateHost) {}

  /** Looks for a newer version, and offers it. Silent if it can't (e.g. offline). */
  async check() {
    let update: AvailableUpdate | null;
    try {
      update = await this.host.find();
    } catch (e) {
      console.warn("Could not check for updates:", e);
      return;
    }
    if (!update) {
      return;
    }
    this.update = update;
    this.offer = {
      version: update.version,
      currentVersion: update.currentVersion,
      releases: notesSince(update.notes, update.version, update.currentVersion),
    };
    this.notifyUnlessShown();
  }

  /** Downloads the version offered, installs it, and starts the app again. */
  async install() {
    const update = this.update;
    if (!update || this.busy) {
      return;
    }
    try {
      if (!this.downloaded) {
        this.busy = m.update_downloading();
        await update.download((done) => {
          this.busy =
            done === null
              ? m.update_downloading()
              : m.update_downloading_percent({ percent: Math.round(done * 100) });
        });
        // Kept if the user cancels below: no need to download it again.
        this.downloaded = true;
      }
      this.busy = null;
      if (!(await this.host.prepareToQuit())) {
        this.notifyUnlessShown();
        return;
      }
      this.busy = m.update_installing();
      await update.install();
      await this.host.restart();
    } catch (e) {
      this.host.notify(m.update_failed({ error: errorMessage(e) }), "error");
    } finally {
      this.busy = null;
    }
  }

  private notifyUnlessShown() {
    if (this.offer && !this.host.startScreenOpen()) {
      this.host.notify(m.update_available({ version: this.offer.version }), "info", {
        label: m.update_install(),
        run: () => void this.install(),
      });
    }
  }
}
