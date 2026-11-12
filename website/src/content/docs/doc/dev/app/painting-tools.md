---
title: Painting tools
description: The pencil, ink, brush, eraser and other libmypaint tools, and their sample queue.
sidebar:
  order: 7
---

## Purpose

The painting tools (pencil, ink, brush, watercolor, airbrush, blend, texture, eraser) paint with libmypaint brushes. Each tool offers a set of brushes and remembers the last one. This page tells how the tool sends the samples to the engine. The engine itself is in [Brush engine](../../painting/brush-engine/).

## Files

| File                                 | Purpose                                        |
| ------------------------------------ | ---------------------------------------------- |
| `src/lib/app/tools/mypaint-tools.ts` | The tools, and `QueuedStroke`.                 |
| `src/lib/mypaint/stroke.ts`          | `MyPaintStroke`: one stroke in libmypaint.     |
| `src/lib/mypaint/brush-sets.ts`      | The brushes of each tool.                      |
| `src/lib/mypaint/brushes.ts`         | The bundled brushes, with their measured size. |

## Concepts

### Why a queue

libmypaint can be slow. A large brush puts many large _dabs_ (small round marks) along the stroke. If the tool paints each sample when it comes, a large brush can block the interface for a long time.

Thus, `QueuedStroke` keeps the samples in a queue (`pending`). In each frame, `flush(budgetMs)` paints samples until the time budget is used. A large brush is then behind the pen, but the interface does not stop. When the pen goes up, the next frames paint the rest of the queue. The stroke becomes an undo step when the queue is empty.

The samples keep their original times. Thus, the speed of the pen, as libmypaint sees it, does not change. Brushes that change with the speed look the same.

### Cost of a segment

One sample can be very far from the last one (a fast movement). libmypaint then paints a long segment in one call, and this one call can be longer than the frame. Thus, `move` cuts long segments:

```ts
// src/lib/app/tools/mypaint-tools.ts
const length = Math.hypot(s.x - prev.x, s.y - prev.y);
const parts = Math.ceil((length * this.size) / MAX_SEGMENT_COST);
for (let i = 1; i < parts; i++) {
  this.pending.push(between(prev, s, i / parts));
}
```

The cost is the length times the brush size. `MAX_SEGMENT_COST` is 4000: about 4 ms on a fast computer. `between` calculates a sample on the line between two samples: position, pressure, tilt and time.

### Samples with the same time

Many systems give event times with a 1 ms resolution. Two samples can then have the same time. libmypaint calculates the speed as distance divided by time. With a time difference of 0, the speed is infinite.

Thus, `queue` keeps the samples with the same time (`sameTime`) until a later sample comes. Then it spreads their times evenly between the two known times (with a maximum interval of 100 ms). MyPaint does the same.

### Taps

libmypaint puts dabs only along a movement. A tap with no movement gives nothing. Thus, `finish` checks how far the pen moved. If it moved less than 1 pixel, it calls `stroke.tap(...)` with a pressure of at least 0.3. `tap` makes the brush put dabs over time for 30 ms.

## How it works

### Begin

`mypaintTool(...).begin` refuses if the engine is not loaded yet. Else it makes a `QueuedStroke`. The constructor:

1. Gets the brush of the preset from the painter (`context.brush(preset)`). The tools share the brushes. Thus, it sets the paint mode for each stroke.
2. Sets the paint mode. _Pigment mode_ mixes colors like real paint (spectral mixing). It is slower where the layer already has color. The airbrush uses normal mixing: it puts many large, light dabs, where pigment mode costs most, and the difference is small.
3. Sets the size. The user sets the largest diameter (at full pressure). libmypaint uses a base diameter that the pressure then changes. Thus, the tool divides the size by the `sizeFactor` of the brush.
4. Sets the color.
5. Makes a `MyPaintStroke` with the opacity and the selection clip.
6. Calls `moveTo` at the first sample. This puts the brush at the start without paint.

### Each frame

```ts
flush(budgetMs: number) {
  const start = this.now();
  let done = 0;
  while (done < this.pending.length) {
    this.queue(this.pending[done++]);
    if (this.now() - start >= budgetMs) break;
  }
  this.pending.splice(0, done);
  this.stroke.flush();
}
```

It paints at least one sample. Then `stroke.flush()` copies the changed tiles to the layer, and the view shows them.

### Finish and cancel

`finish` sends the samples that still wait for a later time (1 ms apart), makes the tap if necessary, then calls `stroke.finish(label)`. `cancel` empties the queue and puts the layer back.

## Optimizations

- The time budget keeps the interface fast with any brush size.
- The split of long segments keeps each libmypaint call short.
- The brushes are made one time and kept by the painter.
- The airbrush does not use pigment mode.

## Limits

- A very large brush moved fast is behind the pen. This is intentional.
- The speed dynamics depend on the zoom, because libmypaint measures the speed on the screen.
