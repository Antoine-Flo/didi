---
title: Painter and stroke lifecycle
description: How a stroke goes from the first sample to an undo step.
sidebar:
  order: 4
---

## Purpose

The `Painter` connects the input to the tools. It receives the samples of a stroke, gives them to the active tool, shows the changes one time for each frame, and puts the result in the history as one undo step. It does not know which tool is active.

## Files

| File                                      | Purpose                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `src/lib/app/input/painter.ts`            | The `Painter` class.                                      |
| `src/lib/app/tools/tool.ts`               | `Tool`, `ToolStroke`, `ToolContext`, `Sample`.            |
| `src/lib/app/ui/canvas/CanvasView.svelte` | The frame loop: it calls `painter.flush()` in each frame. |
| `src/lib/app/commands/run-command.ts`     | Runs a command. It refuses while the pen is down.         |

## Concepts

### The frame loop

The screen shows a new image about 60 times each second (16.7 ms for each frame). The browser calls `requestAnimationFrame` callbacks before each frame. PixiJS has a _ticker_ that uses it. `CanvasView` adds one function to the ticker:

```ts
// src/lib/app/ui/canvas/CanvasView.svelte
pixi.ticker.add((ticker) => {
  showPointer();
  painter?.flush();
  view?.flush();
  ...
});
```

The input events come at any time, many times in each frame. A tool can change the pixels at each sample (the pixel brush) or one time for each frame (the shapes). The changes show only in the frame loop: the upload to the GPU is done one time for each frame, not one time for each sample.

### ToolStroke

`tool.begin(...)` returns a `ToolStroke`, or `null` if the tool does its work at once (for example the picker). A `ToolStroke` has these methods:

| Method         | When the painter calls it                                  |
| -------------- | ---------------------------------------------------------- |
| `move(sample)` | For each sample.                                           |
| `flush()`      | One time for each frame. Shows the changes.                |
| `finish()`     | Ends the stroke. Returns the undo step (`Edit`) or `null`. |
| `cancel()`     | Puts the layer back as it was before the stroke.           |

## How it works

### Begin

`Painter.begin(sample, eraser)`:

1. If a stroke is still in progress, it ends it.
2. It chooses the tool: the picker if Alt is held, else `host.tool(eraser)`.
3. It checks the active layer. If the tool needs a layer, the layer must exist, be unlocked and be visible. Else it shows a message and returns `false`.
4. It checks the color. If the tool needs a color and there is none, it refuses.
5. It applies the floating selection (`editor.applySelection()`). A tool that changes a layer must not paint below floating content.
6. It makes a `ToolContext` (the editor, the layer, the color, the keys held, `pick`, `refuse`).
7. It calls `tool.begin(context, settings, sample)`, then `stroke.move(sample)`.

### Move and flush

`move(samples)` gives each sample to the stroke. The frame loop calls `flush()`, and the painter calls `stroke.flush()`.

### End

When the pen goes up, `end()` finishes the stroke at once. It calls `stroke.finish()`. If it returns an `Edit`, the painter pushes it to the history.

`cancel()` calls `stroke.cancel()`. The layer goes back to its state before the stroke, and no undo step is made.

### Commands during a stroke

`runCommand` does not run a command while the pen is down (`painter.active`). When the pen is up, the stroke is already in the history. Thus, Ctrl+Z undoes the stroke that you just did.

## Limits

- One stroke at a time.
- The painter works on one editor. `setEditor` cancels the stroke in progress when the document changes.
