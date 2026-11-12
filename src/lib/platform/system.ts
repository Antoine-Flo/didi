// Where the app runs, told in the bug and feedback forms: the desktop app on Linux or Windows,
// or the web with its browser and system. Read from the user agent: names only, no versions.

import { isTauri } from "@tauri-apps/api/core";

export interface SystemInfo {
  /** "web", or the desktop app's system: "linux", "windows", "macos". */
  readonly source: string;
  /** In a browser only: "chrome", "firefox", "safari", "edge"… Empty in the desktop app. */
  readonly browser: string;
  /** "windows", "macos", "linux", "android", "ios", or empty if unknown. */
  readonly os: string;
}

/** The system named by a user agent. */
export function osOf(userAgent: string): string {
  // iPads ask for desktop pages and say "Macintosh": iOS is told apart by touch, below.
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return "ios";
  }
  if (/Android/.test(userAgent)) {
    return "android";
  }
  if (/Windows/.test(userAgent)) {
    return "windows";
  }
  if (/Macintosh|Mac OS X/.test(userAgent)) {
    return "macos";
  }
  if (/Linux|X11|CrOS/.test(userAgent)) {
    return "linux";
  }
  return "";
}

/** The browser named by a user agent. Most say "Chrome" and "Safari": the order matters. */
export function browserOf(userAgent: string): string {
  const browsers: [RegExp, string][] = [
    [/Edg\//, "edge"],
    [/OPR\/|Opera/, "opera"],
    [/SamsungBrowser/, "samsung"],
    [/Firefox\/|FxiOS/, "firefox"],
    [/Chrome\/|CriOS|Chromium/, "chrome"],
    [/Safari\//, "safari"],
  ];
  return browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "";
}

/** Where the app runs now. */
export function systemInfo(): SystemInfo {
  if (typeof navigator === "undefined") {
    return { source: "web", browser: "", os: "" };
  }
  const agent = navigator.userAgent;
  const touchMac = /Macintosh/.test(agent) && navigator.maxTouchPoints > 1;
  const os = touchMac ? "ios" : osOf(agent);
  return isTauri()
    ? { source: os, browser: "", os }
    : { source: "web", browser: browserOf(agent), os };
}
