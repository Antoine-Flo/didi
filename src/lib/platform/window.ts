// The app's own window, in the desktop app: title, buttons, closing. Null in a browser, which
// has its own (see capabilities.ownWindow).

import { getCurrentWindow } from "@tauri-apps/api/window";
import { capabilities } from "./capabilities";

export const appWindow = capabilities.ownWindow ? getCurrentWindow() : null;
