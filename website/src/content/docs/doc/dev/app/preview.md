---
title: Preview
description: The preview of the whole drawing, over the canvas or in its own window, and how it receives the pixels.
sidebar:
  order: 25
---

## Purpose

The preview shows the whole drawing, with all the visible layers merged. It has three places (`PreviewPlace`):

- `"off"`: no preview.
- `"in"`: a small panel over the canvas (`PreviewPopin`).
- `"out"`: a separate window, that the user can move to another screen. Only the desktop app can do this (`capabilities.windows`).

## Files

| File                                          | Purpose                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/app/preview/preview-link.ts`         | The messages, `PreviewSender`, and the `BroadcastChannel`. |
| `src/lib/app/preview/preview-state.svelte.ts` | `PreviewState`: the place of the preview, and its window.  |
| `src/lib/app/ui/preview/PreviewPopin.svelte`  | The preview over the canvas.                               |
| `src/lib/app/ui/preview/PreviewImage.svelte`  | Shows the received pixels, with zoom and pan.              |
| `src/lib/app/ui/preview/PreviewBar.svelte`    | The bar of the preview: zoom, pop out, close.              |
| `src/routes/(app)/preview/+page.svelte`       | The page of the preview window.                            |
| `src/lib/platform/preview-window.ts`          | Opens the Tauri window at the URL `/preview`.              |

## Concepts

### Two windows do not share memory

In the desktop app, each window is a separate webview. It has its own JavaScript and its own memory. The preview window cannot read the `Drawing` of the editor.

Thus, the editor sends the pixels in messages, over a [`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel). A `BroadcastChannel` connects all the pages of the same origin that open a channel with the same name (`"didi-preview"`).

### The messages

```ts
// src/lib/app/preview/preview-link.ts
export type ToPreview =
  | { type: "size"; width: number; height: number }
  | { type: "pixels"; rect: Rect; data: Uint8ClampedArray };

export type FromPreview = { type: "hello" };
```

- `size`: the size of the drawing. A new size means a new image.
- `pixels`: a rectangle of merged pixels, in straight (not premultiplied) RGBA. The preview puts it directly into an `ImageData`.
- `hello`: the preview window is open and needs all the image.

## How it works

### The sender

`PreviewSender` follows a `Drawing` and sends what changes:

1. At start, it sends the size and all the image (`sendAll`).
2. It subscribes to the drawing. For each change, `changedRect` gives the changed area:
   - a pixel change gives the union of the changed areas of its tiles,
   - any other change (a layer added, hidden, moved…) can change all the image, so it gives all the drawing.
3. `invalidate(rect)` adds the area to a dirty rectangle and asks for one animation frame.
4. In the frame, it merges the layers in the dirty rectangle only (`composite`), converts to straight alpha (`unpremultiply`), and sends one `pixels` message.

### The receiver

`PreviewImage.receive(message)`:

- with `size`: changes the size of its canvas, if it is different.
- with `pixels`: puts the pixels at their place in its 2D canvas (`putImageData`).

### In or out

The same sender works in both places. Only the `post` function changes:

- **In** (`PreviewPopin`): `new PreviewSender(drawing, (message) => view.receive(message))`. The message goes directly to the component.
- **Out** (`sendToWindow`): `post` sends the message on the channel. When the window sends `hello`, the sender sends all the image again.

`PreviewState` opens the window when the place becomes `"out"`. An effect runs `sendToWindow` while the place is `"out"`. When the effect stops, the function that `sendToWindow` returns closes the channel. When the user closes the window, the place goes back to `"off"`.

### Zoom of the preview

`PreviewImage` fits the drawing in its room. Above 100 %, the fit uses whole steps (2×, 3×…), and the canvas uses square pixels. The position on the screen is rounded to whole device pixels. Thus, pixel art stays sharp in the preview.

## Optimizations

- **Once for each frame.** A stroke changes pixels many times between two frames. The sender joins all the changes into one rectangle and sends one message for each frame.
- **Only the changed area.** The sender merges and sends only the dirty rectangle, not all the drawing.
- **Tile areas.** A pixel change gives the changed area inside each tile (`areas`). Thus, a small stroke in a large tile sends a small rectangle.

## Limits

- The dirty area is one rectangle. Two small changes at opposite corners send all the rectangle between them.
- In a browser, there is no separate window: the preview stays over the canvas.
