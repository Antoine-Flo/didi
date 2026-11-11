// Updates of the desktop app by itself, for the builds that have the updater (the testers'
// builds, see tools/build/release-alpha.mjs). The store builds don't: the stores update them.
// A browser always runs the latest version.
//
// In development, `npm run dev:fake-update` pretends there is one (see fake-update.ts).

import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { fakeUpdate, fakeUpdates } from "#lib/platform/fake-update.js";

export interface AvailableUpdate {
  readonly version: string;
  /** The version running. */
  readonly currentVersion: string;
  /** What the release says about itself: see release-notes.ts. */
  readonly notes: string;
  /** Downloads it; `onProgress` gets the part done, from 0 to 1, or null if unknown. */
  download(onProgress: (done: number | null) => void): Promise<void>;
  /** Installs what was downloaded. On Windows, the app quits for the installer. */
  install(): Promise<void>;
}

/** A newer version, if this build updates itself and there is one. */
export async function findUpdate(): Promise<AvailableUpdate | null> {
  if (fakeUpdates) {
    return fakeUpdate();
  }
  if (!isTauri() || !(await invoke<boolean>("updates_enabled"))) {
    return null;
  }
  const update = await check();
  if (!update) {
    return null;
  }
  return {
    version: update.version,
    currentVersion: await getVersion(),
    notes: update.body ?? "",
    download: (onProgress) => {
      let total: number | null = null;
      let received = 0;
      return update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
        }
        onProgress(total ? Math.min(1, received / total) : null);
      });
    },
    install: () => update.install(),
  };
}

/** Starts the app again, e.g. on the version just installed. */
export async function restartApp(): Promise<void> {
  if (fakeUpdates) {
    location.reload();
    return;
  }
  await relaunch();
}
