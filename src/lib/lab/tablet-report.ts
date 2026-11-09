// What the tablet lab page measures and shows, and its text report.

import type { InputReport } from "#lib/lab/input-stats.js";

/** Where pen events come from: the webview's DOM, or native events from Rust. */
export type Source = "dom" | "native";

export interface Live {
  type: string;
  pressure: number;
  tiltX: number;
  tiltY: number;
  buttons: number;
}

export interface Support {
  coalescedEvents: boolean;
  predictedEvents: boolean;
  pointerRawUpdate: boolean;
  altitudeAzimuth: boolean;
  nativeInput: boolean;
}

/** Which pointer features the webview supports, and whether native input is on. */
export function detectSupport(native: boolean): Support {
  const proto = typeof PointerEvent !== "undefined" ? PointerEvent.prototype : null;
  return {
    coalescedEvents: !!proto && "getCoalescedEvents" in proto,
    predictedEvents: !!proto && "getPredictedEvents" in proto,
    pointerRawUpdate: typeof window !== "undefined" && "onpointerrawupdate" in window,
    altitudeAzimuth: !!proto && "altitudeAngle" in proto,
    nativeInput: native,
  };
}

/** The report to copy: environment, support, last strokes and the button log. */
export function reportText(
  support: Support,
  reports: Record<Source, InputReport | null>,
  buttonLog: readonly string[],
): string {
  const lines = [
    `userAgent: ${navigator.userAgent}`,
    `devicePixelRatio: ${devicePixelRatio}`,
    ...Object.entries(support).map(([k, v]) => `${k}: ${v}`),
  ];
  for (const source of ["dom", "native"] as const) {
    const report = reports[source];
    if (!report) {
      continue;
    }
    lines.push(`--- ${source}`);
    for (const [k, v] of Object.entries(report)) {
      lines.push(`${k}: ${Number.isInteger(v) ? v : v.toFixed(3)}`);
    }
  }
  lines.push("--- buttons", ...buttonLog);
  return lines.join("\n");
}
