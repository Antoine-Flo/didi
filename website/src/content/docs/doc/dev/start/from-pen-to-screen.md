---
title: From pen to screen
description: The full path of one stroke, from the pen event to the pixels on the screen.
---

This page follows one stroke through the code. Each step has a link to the page that tells more.

```
pen event ──▶ CanvasInput ──▶ PenInput ──▶ Painter ──▶ tool stroke ──▶ Drawing
                                                                         │
screen ◀── GPU ◀── DrawingView.flush ◀── "pixels-changed" event ◀────────┘
```

## 1. The pen event

There are two sources of pen events:

- **DOM pointer events** (`pointerdown`, `pointermove`, `pointerup`). All browsers send them, for a mouse, a pen or a finger.
- **Native pen events**, on Linux only. The Rust part (`src-tauri/src/tablet.rs`) reads the pen events of GTK and sends them to JavaScript through a Tauri channel (`subscribeNativePen` in `src/lib/platform/pen.ts`). On Linux, the webview (WebKitGTK) shows the pen as a mouse, with a constant pressure of 0.5 and no tilt. The native events give the true pressure and tilt.

When native events are available, they draw. The DOM events then only move the view, except for fingers.

### Coalesced events

The browser does not send a `pointermove` event for each movement of the pen. It sends one event for each frame, and keeps the other movements in a list. `getCoalescedEvents()` gives this list:

```ts
// src/lib/app/input/canvas-input.svelte.ts
const events = e.getCoalescedEvents?.() ?? [];
this.pen?.domMove((events.length ? events : [e]).map((c) => this.domSample(c)));
```

Without this list, a fast stroke has fewer points, and its curves become angles.

## 2. From the screen to the canvas

The event gives a position on the screen. The tools need a position in the pixels of the drawing. The camera (`src/lib/render/camera.ts`) has the pan, the zoom, the rotation and the mirror of the view. `toCanvas(camera, point)` converts a screen point to a canvas point.

The result is a **sample**: a position in canvas pixels, the pressure (0 to 1), the tilt, the time, and the zoom and rotation of the view (`Sample` in `src/lib/app/tools/tool.ts`).

## 3. The start, the movement and the end

`PenInput` (`src/lib/app/input/pen-input.svelte.ts`) decides when a stroke starts and ends, and with which end of the pen. For example, some drivers change from the tip to the eraser with a barrel button. The system then sees the pen go up and the eraser go down. If the two events come in less than 50 ms (`DEVICE_SWITCH_MS`), `PenInput` keeps one stroke.

`PenInput` calls the painter: `begin`, `move` and `end`.

## 4. The painter

`Painter` (`src/lib/app/input/painter.ts`) makes sure that the stroke can start: the layer must be visible and not locked, and the tool must have a color. If it cannot start, the painter shows a message. If a selection is floating (moved, but not put down), the painter puts it down first. Then it asks the active tool for a stroke (a `ToolStroke`), and gives it the samples.

## 5. The tool stroke

Each tool has its own type of stroke:

- **Pixel art tools** (pencil, line, fill...) write the pixels of the drawing directly. They are fast: a pixel art stroke changes few pixels.
- **Painting tools** use libmypaint. A brush stroke can be slow: a large brush puts many dabs. Thus, the stroke keeps the samples in a queue (`QueuedStroke` in `src/lib/app/tools/mypaint-tools.ts`). In each frame, `painter.flush()` paints the queue for about 8 ms, and the rest waits for the next frame. See [Brush engine](/doc/dev/painting/brush-engine/).

## 6. The drawing and the change event

The stroke writes the new pixels in the layer tiles of the `Drawing`. A layer keeps its pixels in tiles of 256 × 256 pixels. The `Drawing` then sends a `"pixels-changed"` event. The event tells which tiles changed and which area of each tile changed.

The drawing does not know the view. It only sends events. Thus, the core code has no dependency on the GPU.

## 7. The view

`DrawingView` (`src/lib/render/drawing-view.ts`) receives the event. It does not update the GPU immediately: it adds the tiles to a list. In `view.flush()`, one time for each frame, it uploads each tile in the list to its GPU texture, one time only. If the event gave a changed area, it uploads only the rows of that area.

This is the most important optimization of the view. During a stroke, the brush changes the same tile many times in one frame. The GPU receives it one time.

## 8. The end of the stroke

When the pen goes up, the stroke ends when all its samples are painted. The stroke then gives one undo step: the tiles before and after the stroke. The editor adds this step to the history. `Ctrl+Z` puts the tiles before the stroke back in the layer.
