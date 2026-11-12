---
title: Pen, mouse and touch input
description: How the canvas reads pointer events, native pen events and fingers, and turns them into samples.
sidebar:
  order: 2
---

## Purpose

The input code reads the events of the mouse, the pen and the fingers on the canvas. It turns them into _samples_ for the painter, or into movements of the view. It also ignores the palm of the hand while the pen draws.

## Files

| File                                       | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/lib/app/input/canvas-input.svelte.ts` | Receives all the events of the canvas and sends them to the correct part.    |
| `src/lib/app/input/pen-input.svelte.ts`    | Decides when a stroke starts and ends, from DOM events or native pen events. |
| `src/lib/app/input/touch-gestures.ts`      | Fingers: draw, move, zoom, turn, undo, redo.                                 |
| `src/lib/app/input/pointer-lead.ts`        | Draws the pointer a little ahead of the pen, to hide the latency.            |
| `src/lib/app/input/modifiers.svelte.ts`    | The keys held now: Shift, Ctrl, Alt.                                         |
| `src/lib/app/input/last-pointer.ts`        | The type of the last pointer (pen, touch, mouse), for bug reports.           |
| `src/lib/app/shared/dismissal.ts`          | Ignores the click that closes a menu above the canvas.                       |
| `src/lib/platform/pen.ts`                  | Native pen events (Linux only).                                              |

## Concepts

### Pointer events

The browser sends _pointer events_ for the mouse, the pen and the fingers: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`. Each event has:

- `pointerType`: `"mouse"`, `"pen"` or `"touch"`.
- `pointerId`: one id for each finger or device.
- `clientX`, `clientY`: the position in the window.
- `pressure`: 0 to 1. A mouse gives 0.5 while a button is down.
- `tiltX`, `tiltY`: the tilt of the pen, in degrees.
- `button`, `buttons`: which button changed, and which buttons are down. Button 5 (bit 32 in `buttons`) is the eraser end of the pen.
- `timeStamp`: the time of the event, in milliseconds.

### Coalesced events

A pen can send 200 positions or more each second. The browser sends `pointermove` one time for each frame only (about 60 times each second). It keeps the other positions in the event. `getCoalescedEvents()` gives all of them. Without them, a fast stroke has angles where it must have curves.

```ts
// src/lib/app/input/canvas-input.svelte.ts
const events = e.getCoalescedEvents?.() ?? [];
this.pen?.domMove((events.length ? events : [e]).map((c) => this.domSample(c)));
```

### Pointer capture

`element.setPointerCapture(id)` sends all the next events of this pointer to the element, also when the pointer goes outside it. The canvas uses it when a stroke or a pan starts. Thus, the stroke does not stop at the edge of the canvas.

### Samples

A `Sample` (`src/lib/app/tools/tool.ts`) is one point of a stroke, in canvas pixels:

```ts
export interface Sample {
  x: number;
  y: number;
  pressure: number; // 0 to 1. Mice report 1.
  tiltX?: number;
  tiltY?: number;
  time?: number; // milliseconds
  viewZoom?: number;
  viewRotation?: number;
}
```

`CanvasInput.sample` changes a position in the view into canvas pixels with `toCanvas(camera, p)`. It also adds the zoom and the rotation of the view: some brushes change with the speed on the screen. A mouse always gives a pressure of 1 (`domPressure`).

### Native pen events

On Linux, the webview does not give the pressure of all tablets. The desktop app reads the tablet directly (`src-tauri/src/tablet.rs`) and sends _native pen events_ to the page. When these events are available, they draw, and the DOM pen events only move the view. Fingers always come as DOM events.

## How it works

### CanvasInput

`CanvasInput` receives the events of the canvas element:

- **Middle button, or Space + left button**: pan. It keeps the last position and moves the camera by the difference.
- **Left button or eraser button**: it calls `PenInput.domDown`. The eraser end uses the eraser tool of the mode.
- **Touch**: it sends the finger to `TouchGestures`.
- **Esc**: it cancels the stroke in progress.

### PenInput

`PenInput` decides when a stroke starts and ends. It calls the painter: `begin`, `move`, `end`, `cancel`.

It ignores a press when:

- native events are in use and the press is a DOM pen press,
- a stroke is already in progress,
- the press closes a menu (`consumeDismissal`).

**Device switch.** Some tablet drivers change from the tip to the eraser with a button on the pen. The system then sees the pen go up and the eraser go down at the same time. `PenInput` waits `DEVICE_SWITCH_MS` (50 ms) before it ends a native stroke. If a new press comes in this time, the stroke continues.

**Lost release.** If the pen goes up in another window (for example a color dialog), the canvas does not get the release. When a native move comes with `pressed: false`, `PenInput` ends the stroke. When the window loses the focus, the canvas also ends the stroke.

### Palm rejection

While the pen draws, a touch on the screen is the palm of the hand. `CanvasInput.pointerDown` ignores it:

```ts
if (e.pointerType === "touch") {
  // The palm, while the pen draws: ignored.
  if (this.stroking && !this.touchStroke) {
    return;
  }
  ...
}
```

When the pen goes down, `penDown()` calls `touch.abandon()`. The fingers that are already on the screen then do nothing until they go up.

### Touch gestures

`TouchGestures` is a _state machine_. A state machine has a small set of states. Each event can change the state. The state then decides what the next events do.

| State      | Meaning                                                           |
| ---------- | ----------------------------------------------------------------- |
| `idle`     | No finger is down.                                                |
| `pending`  | Fingers are down. They did not move. It can be a tap.             |
| `stroke`   | One finger draws.                                                 |
| `navigate` | The fingers move the view.                                        |
| `spent`    | The gesture is finished. Nothing happens until all fingers go up. |

The rules:

1. One finger goes down and finger drawing is on: the stroke starts at once, with no delay.
2. A second finger goes down less than `GESTURE_GRACE_MS` (250 ms) after the stroke started: the stroke was the start of a gesture. The stroke is cancelled. If the second finger comes later, the stroke is kept and the fingers move the view.
3. A finger moves more than `TAP_SLOP` (10 view pixels): the fingers move the view.
4. All fingers go up in less than `TAP_MS` (300 ms) and no finger moved: two fingers undo, three fingers redo.

"Finger drawing" is a preference: on, off or auto. With auto, fingers draw until the app sees a pen.

### Pinch zoom

With two fingers, `follow()` calculates the new camera from the position of the fingers at the start (`anchor`) and now:

- **Zoom**: the distance between the fingers now, divided by the distance at the start.
- **Rotation**: the angle of the line between the fingers now, minus the angle at the start.
- **Pan**: the middle point of the fingers now, minus the middle point at the start.

```ts
camera = zoomAt(camera, mid0, span / span0);
if (this.rotating) {
  camera = rotateAt(camera, mid0, turn - anchor.turnedFrom);
}
this.host.setCamera(pan(camera, mid.x - mid0.x, mid.y - mid0.y));
```

It always starts from the camera at the start of the gesture, not from the last camera. Thus, small errors do not add up, and the canvas stays under the fingers.

When you zoom, the fingers turn a little. Thus, the view turns only after the fingers turn more than `ROTATE_START` (about 10°). Then it subtracts this angle (`turnedFrom`), so the view does not jump.

When a finger goes down or up during the gesture, `reanchor()` starts again from the current camera and positions.

### The pointer ahead of the pen

The screen shows a frame some milliseconds after the pen gets to a position. Thus, a pointer drawn at the pen position is behind the pen. `PointerLead` draws it a little ahead:

1. It calculates the speed of the pen, in pixels for each millisecond.
2. It smooths the speed with an _exponential moving average_. Each new speed changes the average by a factor `k = 1 - exp(-dt / 25 ms)`. Thus, old speeds count less and less.
3. It draws the pointer at `position + speed × 30 ms`, with a maximum of 60 pixels.

It does not do this for a mouse (its movements are not regular, and the pointer would shake), when the pen stops for 40 ms, or for pixel-art tips (their pixels must be exactly under the pen).

### Modifier keys

Native pen events do not tell which keys are held. `modifiers.svelte.ts` follows Shift, Ctrl and Alt on the window, in a `$state` object `held`. Pointer events also update it: this repairs a key release that the window did not get. When the window loses the focus, all keys are released.

Under GTK, the flags of a key event give the state before the event. Thus, `modifiersAfter` reads the key of the event to know if this key goes down or up.

### Dismissal clicks

When a menu is open above the canvas, the click that closes it must not draw. Menus call `popupOpened` and `popupClosed`. `consumeDismissal()` returns `true` while a menu is open, and for 250 ms after it closes: the native pen press can come after the menu is gone.

## Limits

- Native pen events exist only in the Linux desktop app. In other builds, the DOM pointer events draw.
- `TouchGestures` uses only the first two fingers for the view.
- `PointerLead` predicts in a straight line. On a sharp turn, the pointer goes a little too far for some frames.
