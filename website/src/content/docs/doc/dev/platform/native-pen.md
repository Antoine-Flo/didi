---
title: Native pen input
description: How the desktop app reads the real pen events of a tablet on Linux.
sidebar:
  order: 3
---

## Purpose

On Linux, the webview (WebKitGTK) gives the pen to JavaScript as a mouse. The pressure is always 0.5 and there is no tilt. The app also cannot know if the pen or the mouse moves, or if the tip or the eraser end touches the tablet. Thus, the Rust side reads the GTK events of the webview, which have the real pen values, and sends them to JavaScript.

## Files

| File                                       | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `src-tauri/src/tablet.rs`                  | Reads the GTK events and sends `PenEvent`s.       |
| `src/lib/platform/pen.ts`                  | `subscribeNativePen`, `nativePenAvailable`.       |
| `src/lib/app/input/canvas-input.svelte.ts` | Uses the native events instead of the DOM events. |

## Concepts

### GTK events

GTK is the interface toolkit of the webview on Linux. Each input event of GTK has the **axes** of the device: x, y, pressure, x tilt, y tilt. The event also tells the type of the device: pen, eraser, mouse, touchpad, touch screen.

### Event compression

By default, GTK merges the motion events to one event for each frame. For a mouse, this is good. For a pen, it removes samples, and a fast stroke loses its curve. Thus, `disable_compression` turns this off on the window of the webview and on its top window. It runs again when the widget is realized (when GTK makes its window).

### Channel

A Tauri `Channel` sends many messages from Rust to JavaScript, in sequence, to one receiver. JavaScript makes the channel and gives it to the `tablet_subscribe` command:

```ts
// src/lib/platform/pen.ts
const channel = new Channel<PenEvent>();
channel.onmessage = onEvent;
return invoke("tablet_subscribe", { channel });
```

Rust keeps the channel in `PenSink`, a shared value (`Arc<Mutex<Option<Channel>>>`). If a send fails (the page was reloaded, for example), `PenSink` removes the channel.

## How it works

1. At start, `tablet::install` gets the webview of the `main` window and connects three GTK signals: motion, button press, button release.
2. For each event, `pen_event` makes a `PenEvent`: phase, position, pressure, tilt, button, source, `pressed`, and two times.
3. GTK gives the tilt from −1 to 1. `pen_event` multiplies it by 90 to give degrees, as Pointer Events do.
4. The handler returns `Propagation::Proceed`. Thus, WebKit also receives the event. The buttons and the panels of the interface work as usual.
5. In JavaScript, `connectNativePen` calls `nativePenAvailable()`. If it is true, the pen strokes come from the native events (`pen.useNative()` in `pen-input.svelte.ts`). The DOM events of the pen then do not draw. Fingers still draw from the DOM events.

### Fewer hover events

When the pen moves above the tablet without contact, GTK sends many motion events. JavaScript does not need most of them, and too many messages make the pointer late. Thus, a hover move goes to JavaScript only when:

- the tip is down (`pressed`), or
- the device changed (pen ↔ eraser), or
- it is the first move after a press (to find a release that was missed).

### Two times

- `time`: the time of the windowing system, in ms. The differences give the time between two samples.
- `sentAt`: the wall clock time when Rust handled the event. It lets you measure the delay from Rust to JavaScript.

## Limits

- Native events exist on Linux only. On other systems, `tablet_available` returns `false`, and the app uses the Pointer Events of the webview.
- One subscriber at a time. A second `tablet_subscribe` replaces the first channel.
