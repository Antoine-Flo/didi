// A pretend update, to work on how updates show without publishing a version: in development
// only, with `npm run dev:fake-update` (VITE_DIDI_FAKE_UPDATE=1). It downloads in a few
// seconds, installs nothing, and "restarts" by reloading the page.

import type { AvailableUpdate } from "#lib/platform/updater.js";

export const fakeUpdates = import.meta.env.DEV && !!import.meta.env.VITE_DIDI_FAKE_UPDATE;

const DOWNLOAD_MS = 3000;
const STEP_MS = 100;

export function fakeUpdate(): AvailableUpdate {
  return {
    version: "0.1.0-alpha.12",
    currentVersion: "0.1.0-alpha.9",
    notes: JSON.stringify([
      {
        version: "0.1.0-alpha.12",
        date: "2026-11-11T16:20:00.000Z",
        notes: ["Show updates in the start screen", "Keep the last 10 versions"],
      },
      {
        version: "0.1.0-alpha.11",
        date: "2026-11-11T11:05:00.000Z",
        notes: ["Fix the fill tool on transparent layers"],
      },
      { version: "0.1.0-alpha.10", date: "2026-11-10T18:40:00.000Z", notes: ["Stack messages"] },
      { version: "0.1.0-alpha.9", date: "2026-11-10T09:00:00.000Z", notes: ["Already installed"] },
    ]),
    download: (onProgress) =>
      new Promise((resolve) => {
        let elapsed = 0;
        const timer = setInterval(() => {
          elapsed += STEP_MS;
          onProgress(Math.min(1, elapsed / DOWNLOAD_MS));
          if (elapsed >= DOWNLOAD_MS) {
            clearInterval(timer);
            resolve();
          }
        }, STEP_MS);
      }),
    install: async () => {},
  };
}
