---
title: Shared tools and tests
description: The event emitter, the geometry helpers, and the test helpers of the core.
sidebar:
  order: 6
---

## Purpose

The core has small parts that all the other parts use: an event emitter and the geometry of rectangles. It also has helpers for the tests.

## Files

| File                                   | Purpose                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| `src/lib/core/shared/emitter.ts`       | `Emitter`: a minimum event emitter.                       |
| `src/lib/core/shared/geometry.ts`      | `Point`, `Rect`, `intersect`, `union`, `isIntegerRect`.   |
| `src/lib/core/testing/test-utils.ts`   | Helpers for the core tests.                               |
| `src/lib/core/testing/png-fixtures.ts` | Small PNG files and their expected pixels, for the tests. |

## The event emitter

An **event emitter** lets one object tell other objects that something changed, without knowing them. The other objects **subscribe** with a function (a "listener"). The emitter calls each listener when it **emits** an event.

The drawing, the history, the selection and the editor each have an emitter:

```ts
// src/lib/core/shared/emitter.ts
export class Emitter<T> {
  private listeners = new Set<(event: T) => void>();

  subscribe(listener: (event: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: T) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
```

Three details are important:

1. **`subscribe` returns a function that unsubscribes.** Keep it, and call it when the subscriber is removed (for example, when a component is destroyed). If you do not call it, the emitter keeps the listener, and the memory is not released.
2. **`emit` copies the set first** (`[...this.listeners]`). Thus, a listener can unsubscribe during the event, and the loop does not break.
3. **An error in a listener does not stop the emitter.** The drawing emits events in the middle of an operation, for example during an undo of many edits. If an error stopped the operation, the drawing could stay half changed. Thus, the emitter catches the error and throws it again later, in a microtask. The error still shows in the console as an uncaught error, but the other listeners and the operation continue.

## Geometry

`Rect` is a rectangle with sides parallel to the axes: `x`, `y`, `width`, `height`, in pixels. The right edge is `x + width`, and it is not in the rectangle. Thus, a rectangle at `x = 0` with `width = 10` covers the columns 0 to 9.

- `intersect(a, b)`: the overlap of two rectangles, or `null` if they do not overlap. If they only touch at an edge, there is no overlap.
- `union(a, b)`: the smallest rectangle that contains the two.
- `isIntegerRect(r)`: all values are integers, and the size is not negative. The tile store refuses other rectangles.

## Test helpers

The tests are next to the code (`*.test.ts`) and use Vitest. Some tests also use **property-based testing** with `fast-check`: the library makes many random inputs and checks that a rule is always true (for example, "after any sequence of edits, undo of all the edits gives the first state again", in `src/lib/core/history/edits.test.ts`).

`test-utils.ts` gives:

| Helper            | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `fill`            | A region of one color.                                                              |
| `pattern`         | A region with a varied pattern. A row or a column in the wrong place shows clearly. |
| `firstDifference` | The index of the first different byte of two buffers.                               |
| `capture`         | A full copy of the state of a drawing, to compare it later.                         |
| `expectSameState` | Makes sure that two captured states are the same.                                   |

`png-fixtures.ts` holds small PNG files in many formats, as base64 text, and the RGBA pixels that a reference decoder reads from them. The PNG decoder tests compare their result with these pixels.

The ESLint rules forbid an import of `src/lib/core/testing/` from code that is not a test.
