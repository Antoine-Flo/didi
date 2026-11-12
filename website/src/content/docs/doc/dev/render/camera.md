---
title: Camera and zoom
description: The transform between canvas pixels and screen pixels, and the zoom levels for pixel art.
sidebar:
  order: 2
---

## Purpose

The camera tells where the canvas is on the screen: its position, its zoom, its rotation, and if it is mirrored. The code uses the camera in two directions:

- From the canvas to the screen: to show the drawing and the pointers.
- From the screen to the canvas: to know which canvas pixel is under the pen.

The zoom levels change the zoom so that pixel art stays regular on the screen.

## Files

| File                            | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `src/lib/render/camera.ts`      | The `Camera` type and its math. No rendering.              |
| `src/lib/render/pixel-zoom.ts`  | The zoom levels for pixel art.                             |
| `src/lib/render/camera.test.ts` | Tests: each transform and its inverse give the same point. |

`camera.ts` and `pixel-zoom.ts` contain only math. Thus, the tests do not need a GPU or a browser.

## Concepts

### Canvas pixels and screen pixels

A **canvas pixel** is one pixel of the drawing. A **screen pixel** is one CSS pixel in the window. At zoom 2, one canvas pixel covers 2 × 2 screen pixels.

On a dense screen, one CSS pixel covers more than one **device pixel** (a real pixel of the display). `devicePixelRatio` gives this ratio. For example, a phone can have 3 device pixels for each CSS pixel.

### The transform

The camera has these values:

```ts
// src/lib/render/camera.ts
export interface Camera {
  x: number; // screen position of the canvas origin
  y: number;
  zoom: number;
  rotation: number; // radians
  mirrored?: boolean;
}
```

To go from the canvas to the screen, the code does these operations in this sequence:

1. Mirror: if `mirrored`, change the sign of x.
2. Scale: multiply by `zoom`.
3. Rotate: turn by `rotation` around the origin.
4. Translate: add `(x, y)`.

As a formula: `screen = translate · rotate · scale · mirror · canvas`.

A rotation by an angle θ uses cos θ and sin θ. `toScreen` multiplies cos and sin by the zoom first. Thus, one step does the scale and the rotation:

```ts
// src/lib/render/camera.ts
export function toScreen(c: Camera, p: Point): Point {
  const cos = Math.cos(c.rotation) * c.zoom;
  const sin = Math.sin(c.rotation) * c.zoom;
  const x = c.mirrored ? -p.x : p.x;
  return { x: c.x + x * cos - p.y * sin, y: c.y + x * sin + p.y * cos };
}
```

`toCanvas` does the inverse operations in the inverse sequence: subtract `(x, y)`, turn by −θ, divide by the zoom, then mirror.

The camera is immutable. Each function gives a new camera. This makes the code easy to test, and the interface can compare the old camera with the new one.

## How it works

### Zoom or rotate around a point

When the user zooms with the mouse wheel, the canvas point under the pointer must stay under the pointer. A change of the zoom alone moves the canvas around its origin, so the point moves.

`keepAt` corrects this. All the operations around a point use it:

1. Before the change, find the canvas point under the screen point (`toCanvas`).
2. Make the new camera (new zoom, new rotation, or new mirror).
3. Find where the canvas point is now on the screen (`toScreen`).
4. Move the camera by the difference.

```ts
// src/lib/render/camera.ts
export function zoomAt(c: Camera, screen: Point, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor));
  return keepAt({ ...c, zoom }, toCanvas(c, screen), screen);
}
```

`rotateAt`, `setRotationAt` and `mirrorAt` work the same way. The zoom stays between 1/64 and 64.

### Fit the canvas

`fit` gives a camera that shows all the canvas in the view, with no rotation. It takes the smaller of the two ratios (view width / canvas width, view height / canvas height), multiplies it by a margin (0.9), and puts the canvas at the center.

### The visible area

`visibleRect` gives the canvas pixels that are in the view. It converts the four corners of the view to canvas pixels. When the view is turned, these corners do not make a rectangle that is aligned with the canvas. Thus, the function takes the smallest rectangle that contains the four corners. Then it cuts this rectangle to the canvas. The grids use it to draw only the visible lines.

### Device pixel alignment

At a whole zoom (2, 3, 4…), each canvas pixel can cover the same number of device pixels. For this, the canvas origin must be on the edge of a device pixel. If the origin is at 0.5 device pixel, each canvas pixel cuts device pixels in two, and the edges are not sharp.

`DrawingView.setCamera` rounds the position to the nearest device pixel when there is no rotation:

```ts
// src/lib/render/drawing-view.ts
const r = globalThis.devicePixelRatio || 1;
const snap = (v: number) => (camera.rotation === 0 ? Math.round(v * r) / r : v);
this.canvasRoot.position.set(snap(camera.x), snap(camera.y));
```

The view rounds only the displayed position. The camera keeps the exact position. If the camera kept the rounded value, a slow pan of less than one pixel for each frame would never move.

### Zoom levels for pixel art

At a zoom of 150 %, one canvas pixel covers 1.5 device pixels. The GPU cannot show half a pixel, so some canvas pixels cover 1 device pixel and others cover 2. The drawing looks irregular. This is very visible in pixel art.

`pixel-zoom.ts` keeps the zoom on **levels** when the canvas pixels are small on the screen. A level is a whole number of device pixels for each canvas pixel (1, 2, 3…), or the inverse of a whole number (1/2, 1/3…) when you zoom out.

From 8 device pixels for each canvas pixel (`FREE_FROM`), a difference of one device pixel is not visible. Above this value, the zoom is free, as in painting.

The functions calculate in device pixels (`zoom × dpr`), not in CSS pixels. On a dense screen, the free zone starts at a lower zoom.

| Function          | Use                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `isFreeZoom`      | Tells if the zoom is in the free zone.                                                         |
| `snapZoomDown`    | The level at or below the zoom. To fit the canvas: the canvas never gets larger than the view. |
| `snapZoomNearest` | The nearest level. At the end of a pinch gesture.                                              |
| `stepZoom`        | One step in or out. In the free zone, it multiplies by 1.25. Below, it goes to the next level. |

To compare two levels, `snapZoomNearest` uses ratios (`d / below` and `above / d`), not differences. On a zoom scale, the distance from 2 to 4 is the same as from 4 to 8.

When you zoom out from the free zone, `stepZoom` stops at `FREE_FROM` first. Thus, the zoom does not jump over the first level.

Floating-point numbers are not exact. For example, `3 × (1/3)` can give `0.9999999`. The functions use a small tolerance (`EPS = 1e-6`): a zoom this near a level is on the level.

## Limits

- The camera does not know the canvas size or the view size. The functions that need them take them as arguments.
- The device pixel alignment works only without rotation. A turned canvas cannot align with the device pixels.
- The pixel-art levels apply only below `FREE_FROM`. Above it, the zoom can show canvas pixels with different sizes, but the difference is less than 1/8.
