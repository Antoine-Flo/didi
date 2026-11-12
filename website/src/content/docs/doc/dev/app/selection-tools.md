---
title: Selection tools
description: How the selection tools make, move and transform a selection, and how each gesture becomes one undo step.
sidebar:
  order: 8
---

## Purpose

The selection tools make a selection (rectangle or lasso), and then move, scale, rotate or skew it. What the pen does depends on where it goes down. There are two tools: one keeps the pixels exact (pixel art), the other one smooths the transformed pixels (painting).

The data of the selection is in `src/lib/core/selection`. This page tells how the tools use it.

## Files

| File                                   | Purpose                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/app/tools/select-tool.ts`     | The two tools. They choose a gesture from the zone under the pen. |
| `src/lib/app/tools/select-gesture.ts`  | `Gesture`, and the gestures on an existing selection.             |
| `src/lib/app/tools/select-new-area.ts` | The gestures that make a new selection.                           |
| `src/lib/core/selection/handles.ts`    | The zones of a selection (`zoneAt`) and their pointers.           |
| `src/lib/core/selection/floating.ts`   | Floating content: `lift`, `showFloating`.                         |
| `src/lib/core/selection/placement.ts`  | Where the content is: position, size, transform.                  |

## Concepts

### Zones

`zoneAt(placement, x, y, zoom, pivot)` tells which part of the selection is under the pen:

| Zone      | Where                                  | Gesture                                |
| --------- | -------------------------------------- | -------------------------------------- |
| `outside` | Not on the selection.                  | New selection.                         |
| `bounds`  | A handle on an edge, inside the frame. | Move one edge. The pixels do not move. |
| `pivot`   | The cross in the middle.               | Move the center of rotation.           |
| `inside`  | Anywhere else inside.                  | Move the content.                      |
| `content` | The 8 handles outside the frame.       | Scale the content.                     |
| `rotate`  | The band around the corners.           | Rotate the content.                    |
| `skew`    | The band along the sides.              | Skew the content.                      |

The sizes of the handles are in screen pixels. Thus, the handles look the same at all zoom levels. The `hover` method of the tool gives the CSS pointer of the zone: the user sees what a press will do.

### Floating content

When you move or transform the content for the first time, the tool _lifts_ it out of the layer (`lift`). The layer keeps what is outside the selection shape. The lifted pixels become _floating content_. While the content floats, `showFloating` draws it again at its new place from its original pixels. Thus, many transforms in sequence do not make the pixels worse.

The content stays floating until it is applied (Enter, another tool that changes the layer, or a layer command).

`showFloating` takes each pixel from the original pixel under it (exact). With `smooth`, it mixes the four original pixels around it (bilinear). The smooth tool uses this.

### Draft

While you drag a new selection, only a _draft_ shows (`selection.setDraft`). The real selection comes when the pen goes up.

## How it works

### Choice of the gesture

`begin` finds the zone, then makes the gesture:

```ts
// src/lib/app/tools/select-tool.ts
if (zone.kind === "outside") {
  return settings.shape === "lasso"
    ? new NewLasso(context, sample)
    : new NewRectangle(context, sample);
}
if (zone.kind === "bounds") return new MoveEdge(context, sample, zone.side);
if (zone.kind === "pivot") return new MovePivot(context, sample);
```

For `inside`, `content`, `rotate` and `skew`, it makes a `TransformContent` with a `Place` function. A `Place` function gives the new placement from the placement at the start, the pen now, and the pen at the start (`grab`):

- **Move**: the difference between the pen and the grab, rounded to whole pixels.
- **Scale**: `scaled(...)`. Shift keeps the proportions.
- **Rotate**: the angle from the center to the pen, minus the angle from the center to the grab. Shift snaps the angle to steps of 15°.
- **Skew**: the difference between the pen and the grab, along a side.

Before a transform, `contentLayer` checks the layer: it must exist, be unlocked and be visible.

### Gesture

`Gesture` is the base class of all the gestures. It is a `ToolStroke`.

- The constructor keeps the selection state before the gesture, and the tiles of the layer if pixels can change.
- `move` only records the pen.
- `flush` (each frame) calls `update(pen)`. Thus, the gesture also follows Shift when the pen does not move.
- `finish` compares the state before and after. If nothing changed, it returns `null`. Else it returns one undo step (`selectionEdit`) with the selection and the changed tiles.
- `cancel` puts back the tiles and the selection.

Thus, each gesture is one undo step.

### TransformContent

`update(pen)`:

1. Calculates the next placement with `place`.
2. If it is the same as the shown placement, it stops. This prevents work when the pen does not move a full pixel.
3. Lifts the content if it does not float yet.
4. Shows it at the new placement.
5. Sets the new selection state. When you move the content, the center of rotation moves with it.

### New selections

`NewArea` removes the current selection at the start. A click with no movement thus removes the selection.

- `NewRectangle` makes a box from the first pixel to the pixel under the pen, both included, and cuts it to the canvas.
- `NewLasso` records the center of each new pixel that the pen goes through. `pathSelection(path)` closes the path with a straight line and makes the shape. The draft is updated only when the path gets new points.

## Limits

- A selection belongs to one layer when it floats.
- The bounds handles show only on selections that are large enough on the screen, and not on content that is rotated or skewed until it is applied.
