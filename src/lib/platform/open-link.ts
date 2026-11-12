// Opens a web page outside the app: in the system's browser from the desktop app, in a new
// tab from the web.

import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export async function openLink(url: string): Promise<void> {
  if (isTauri()) {
    return openUrl(url);
  }
  // Called while handling the click: the browser does not block it.
  window.open(url, "_blank", "noopener");
}
