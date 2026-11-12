---
title: View navigation
description: How the app moves, zooms, turns and mirrors the view of the canvas.
sidebar:
  order: 3
---

## Purpose

The view navigation moves the camera of the canvas: fit, zoom, pan, rotation and mirror. The commands, the wheel, the fingers and the size dialog all use it. The camera math itself is in `src/lib/render/camera.ts`.

## Files

| File                                          | Purpose                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/app/input/view-controller.svelte.ts` | The view of the editor. The commands call it. The canvas attaches to it. |
| `src/lib/app/input/view-navigation.ts`        | The camera and how it moves.                                             |
| `src/lib/render/camera.ts`                    | Camera math: `pan`, `zoomAt`, `rotateAt`, `fit`, `toCanvas`.             |
| `src/lib/render/pixel-zoom.ts`                | Zoom levels for pixel art.                                               |

## Concepts

### The camera

A `Camera` has a position (`x`, `y`), a `zoom`, a `rotation` (radians) and `mirrored`. It changes canvas pixels into view pixels. `toCanvas(camera, p)` does the opposite: it gives the canvas pixel under a point of the view.

### Zoom around a point

When you zoom with the wheel, the canvas pixel under the pointer must stay under the pointer. `zoomAt(camera, at, factor)` does this: it changes the zoom, then moves the camera so that `at` shows the same canvas point as before. `rotateAt` and `mirrorAt` work the same way.

### Insets

Panels can cover the sides of the view. `Insets` is the space that the panels take on each side. `visibleArea()` is the view without these spaces. Fit and the zoom buttons use the center of the visible area, not the center of the view.

### Pixel zoom

In pixel art, all canvas pixels must have the same size on the screen. At a zoom of 1.5, one pixel shows as one screen pixel and the next one as two. Thus, when the mode has `pixelZoom`, the zoom snaps to levels where each canvas pixel is a whole number of screen pixels. `devicePixelRatio` is part of the calculation: on a high-density screen, one CSS pixel is two or more screen pixels.

When the zoom is high, the difference is too small to see. There, the zoom is free (`isFreeZoom`).

## How it works

### ViewController

`ViewController` is in `EditorState`. The canvas component (`CanvasView`) attaches to it with `attach(target)` when it mounts. Before that, the commands do nothing. `attach` also resets the camera: a new document does not show turned or mirrored.

Each camera change goes to `navigation.set(camera)`. This updates `cameraNow` (a `$state.raw`, so the interface can show the zoom) and calls `target.show(camera)`.

### The wheel

`wheel(at, e)`:

- With Shift, the wheel turns the view by 15°.
- Without the pixel zoom, the zoom factor is `exp(-delta × 0.0015)`. This is a smooth zoom.
- With the pixel zoom, outside the free zone, one zoom level for each 100 pixels of wheel movement. A mouse wheel gives about 100 for each notch. A touchpad gives many small movements: `wheelRest` adds them until they get to 100.

`deltaMode` can be "lines". Then the code multiplies the movement by 40 to get pixels.

### Fingers

When the fingers stop, `settleZoom` snaps the zoom to the nearest pixel level. During the gesture, the zoom is free. Thus, the movement stays smooth.

## Limits

- Only one view exists for each editor.
- The resize preview of the size dialog goes through `ViewController.previewResize`, but the render code draws it.
