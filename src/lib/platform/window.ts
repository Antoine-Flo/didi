// The app's own window, in the desktop app: title, buttons, closing. Null in a browser, which
// has its own (see capabilities.ownWindow).

import { getCurrentWindow } from "@tauri-apps/api/window";
import { capabilities } from "./capabilities";

export const appWindow = capabilities.ownWindow ? getCurrentWindow() : null;

/** Whether the app's window, or the browser's page, is full screen. */
export async function isFullScreen(): Promise<boolean> {
  return appWindow ? appWindow.isFullscreen() : document.fullscreenElement !== null;
}

/** Full screen or not: the app's window, or the browser's page. */
export async function setFullScreen(on: boolean): Promise<void> {
  if (appWindow) {
    return appWindow.setFullscreen(on);
  }
  if (on === (document.fullscreenElement !== null)) {
    return;
  }
  if (on) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
}

/** Full screen, or back. */
export async function toggleFullScreen(): Promise<void> {
  await setFullScreen(!(await isFullScreen()));
}

/**
 * Calls `listener` with whether it is full screen, now and whenever that changes (F11, Esc,
 * the menus). Returns a function that stops.
 */
export function watchFullScreen(listener: (on: boolean) => void): () => void {
  const check = () => void isFullScreen().then(listener);
  check();
  if (appWindow) {
    const stop = appWindow.onResized(check);
    return () => void stop.then((fn) => fn());
  }
  document.addEventListener("fullscreenchange", check);
  return () => document.removeEventListener("fullscreenchange", check);
}
