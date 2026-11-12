---
title: Painter and stroke lifecycle
description: How a stroke goes from the first sample to an undo step, frame by frame.
sidebar:
  order: 4
---

## Purpose

The `Painter` connects the input to the tools. It receives the samples of a stroke, gives them to the active tool, paints them one time for each frame, and puts the result in the history as one undo step. It does not know which tool is active.

## Files

| File                                      | Purpose                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `src/lib/app/input/painter.ts`            | The `Painter` class.                                      |
| `src/lib/app/tools/tool.ts`               | `Tool`, `ToolStroke`, `ToolContext`, `Sample`.            |
| `src/lib/app/ui/canvas/CanvasView.svelte` | The frame loop: it calls `painter.flush()` in each frame. |
| `src/lib/app/commands/run-command.ts`     | Runs a command. It waits for the stroke in progress.      |

## Concepts

### The frame loop

The screen shows a new image about 60 times each second (16.7 ms for each frame). The browser calls `requestAnimationFrame` callbacks before each frame. PixiJS has a _ticker_ that uses it. `CanvasView` adds one function to the ticker:

```ts
// src/lib/app/ui/canvas/CanvasView.svelte
pixi.ticker.add((ticker) => {
  showPointer(performance.now());
  painter?.flush();
  view?.flush();
  ...
});
```

The input events come at any time, many times in each frame. If the code paints at each event, it paints more than the screen can show, and the interface can stop. Thus, the painter keeps the samples and paints them in the frame loop.

### Frame budget

`flush(budgetMs = 8)` paints the samples that wait, for about 8 ms. Then it stops, also if samples still wait. This leaves time for the rest of the frame (the GPU upload, the interface). A very large brush can then be behind the pen, but the interface does not stop.

### ToolStroke

`tool.begin(...)` returns a `ToolStroke`, or `null` if the tool does its work at once (for example the picker). A `ToolStroke` has these methods:

| Method          | When the painter calls it                                  |
| --------------- | ---------------------------------------------------------- |
| `move(sample)`  | For each sample.                                           |
| `flush(budget)` | One time for each frame. Paints and shows the changes.     |
| `busy`          | `true` while samples wait to be painted.                   |
| `drain()`       | Paints all the samples that wait, now.                     |
| `finish()`      | Ends the stroke. Returns the undo step (`Edit`) or `null`. |
| `cancel()`      | Puts the layer back as it was before the stroke.           |

## How it works

### Begin

`Painter.begin(sample, eraser)`:

1. If a stroke is still in progress, it ends it and paints all its samples.
2. It chooses the tool: the picker if Alt is held, else `host.tool(eraser)`.
3. It checks the active layer. If the tool needs a layer, the layer must exist, be unlocked and be visible. Else it shows a message and returns `false`.
4. It checks the color. If the tool needs a color and there is none, it refuses.
5. It applies the floating selection (`editor.applySelection()`). A tool that changes a layer must not paint below floating content.
6. It makes a `ToolContext` (the editor, the layer, the color, the brush engine, a clock, the keys held, `pick`, `refuse`).
7. It calls `tool.begin(context, settings, sample)`, then `stroke.move(sample)`.

### Move and flush

`move(samples)` gives each sample to the stroke. The frame loop calls `flush()`. When the pen is up and the stroke is not busy, `flush` finishes the stroke.

### End

When the pen goes up, `end()` sets `ending = true`. The stroke can still have samples in its queue (painting brushes). Thus, `end` finishes the stroke only if it is not busy. Else the next frames paint the queue, and the last `flush` finishes it.

`finish()` calls `stroke.finish()`. If it returns an `Edit`, the painter pushes it to the history. It also adds the color to the recent colors.

### Commands during a stroke

`runCommand` does not run a command while the pen is down. If the pen is up but the queue is not empty, it calls `painter.drain()` first. Thus, Ctrl+Z undoes the stroke that you just did, and not the stroke before it.

### Brushes

The painter keeps one libmypaint brush for each preset (`brushes` map). It makes the brush the first time that a tool uses it. This is faster than loading a `.myb` file at each stroke.

## Limits

- One stroke at a time.
- The painter works on one editor. `setEditor` cancels the stroke in progress when the document changes.
