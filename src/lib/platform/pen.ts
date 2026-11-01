import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

/** Pen event sent by the Rust side (see src-tauri/src/tablet.rs). */
export interface PenEvent {
  phase: "down" | "move" | "up";
  /** Position in CSS pixels, relative to the webview. */
  x: number;
  y: number;
  pressure: number;
  /** Tilt in degrees. */
  tiltX: number;
  tiltY: number;
  /** 1 = tip, 2 and 3 = barrel buttons, 0 for moves. */
  button: number;
  source: string;
  /** Whether the tip (or the left mouse button) is held down, before this event. */
  pressed: boolean;
  /** Windowing system time, in ms. */
  time: number;
  /** Wall clock time (ms since epoch) when Rust handled the event. */
  sentAt: number;
}

/** Subscribes to native pen events. Only one subscriber at a time is supported. */
export function subscribeNativePen(onEvent: (e: PenEvent) => void): Promise<void> {
  const channel = new Channel<PenEvent>();
  channel.onmessage = onEvent;
  return invoke("tablet_subscribe", { channel });
}

/** Whether native pen events are available (Tauri on Linux). */
export async function nativePenAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("tablet_available");
  } catch {
    return false;
  }
}
