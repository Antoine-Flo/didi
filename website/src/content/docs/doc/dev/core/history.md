---
title: Undo and redo
description: Edits, the history, groups of edits and the memory limits.
sidebar:
  order: 3
---

## Purpose

The history keeps the changes to the drawing, so that the user can undo and redo them. Each change is an **edit**: an object that can do the change and undo it.

## Files

| File                              | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `src/lib/core/history/edits.ts`   | The `Edit` interface and the basic edits.            |
| `src/lib/core/history/history.ts` | `History`: the undo and redo stacks, groups, limits. |

## Concepts

### An edit

```ts
// src/lib/core/history/edits.ts
export interface Edit {
  readonly label: string; // shown in the menus, for example "Add layer"
  apply(drawing: Drawing): void; // does the change, and does it again on redo
  revert(drawing: Drawing): void; // undoes the change
  bytes?(): number; // the memory that the edit keeps, approximately
  readonly outsideDrawing?: boolean; // the edit changes something else (a palette)
}
```

There are two ways to make undo:

1. Keep a full copy of the document after each change. This is simple, but it uses too much memory for images.
2. Keep each change and a method to undo it. This is the "command" pattern. Didi uses this way.

You make an edit before you apply it. `apply` does the change and records what is necessary to undo it. `revert` uses this record. Calls must alternate: `apply`, `revert`, `apply`…

### How an edit records its inverse

An edit uses the return values of the [drawing](/doc/dev/core/document/). For example:

```ts
// src/lib/core/history/edits.ts
export function moveLayer(id: string, index: number): Edit {
  let from: number;
  return {
    label: m.cmd_layer_move(),
    apply(d) {
      from = d.moveLayer(id, index); // the drawing returns the old index
    },
    revert(d) {
      d.moveLayer(id, from);
    },
  };
}
```

The edit is a closure: `from` is a variable that only this edit can see.

### The basic edits

| Edit           | What it does                                                            |
| -------------- | ----------------------------------------------------------------------- |
| `addLayer`     | Adds a layer. Revert removes it.                                        |
| `removeLayer`  | Removes a layer and keeps it, with its index.                           |
| `moveLayer`    | Moves a layer. Keeps the old index.                                     |
| `updateLayer`  | Changes settings. Keeps the old values.                                 |
| `writePixels`  | Writes a region. Keeps the tiles before and after.                      |
| `replaceTiles` | Puts tiles from `before` to `after`. For changes that are already done. |
| `group`        | Several edits as one step. Revert undoes them in the opposite sequence. |

`writePixels` keeps the raw data only until its first `apply`. Then it keeps two [snapshots](/doc/dev/core/tiles/) (the tiles before and after) and releases the raw data. Redo puts back the "after" snapshot. It does not write the data again. Snapshots share tiles, so they cost little memory.

`replaceTiles` is for a change that the code already did step by step, for example a brush stroke. The stroke changes the layer during the movement of the pen. At the end, it gives a `replaceTiles` edit. When the history applies this edit, the tiles are already in place, so `apply` changes nothing.

## How it works

### Push an edit

```ts
editor.history.push(updateLayer(id, { opacity: 0.5 }));
```

`push(edit)`:

1. Calls `edit.apply(drawing)`. If `apply` throws an error, the history records nothing.
2. Puts the edit on the "past" stack.
3. Clears the "future" stack: after a new change, redo is not possible.
4. Removes the oldest steps if the history is above its limits.
5. Sends a change event.

### Undo and redo

- `undo` takes the last edit from "past", calls `revert`, and puts the edit on "future".
- `redo` takes the last edit from "future", calls `apply`, and puts the edit on "past".

### Groups

Some actions make many edits, but the user must undo them in one step. For example, a slider sends a new value many times during a drag. Use `begin` and `end`:

```ts
history.begin("Opacity");
try {
  history.push(updateLayer(id, { opacity: 0.4 }));
  history.push(updateLayer(id, { opacity: 0.6 }));
} finally {
  history.end();
}
```

Between `begin` and `end`, the history applies each edit immediately, but keeps it in an "open group". `end` makes one `group` edit from them. An empty group makes no step.

Groups can be nested. Only the outermost `begin` and `end` count: the history counts the depth. `undo` and `redo` close an open group first.

Always call `end` in a `finally` block. If you do not, an error leaves the group open.

### Limits

The history has two limits (`HistoryOptions`):

- `maxSteps`: 500 steps.
- `maxBytes`: 512 MB, approximately.

After each new step, `enforceLimits` removes the oldest steps until the history obeys the limits. It always keeps the most recent step, even if this step alone is above the memory limit.

The memory of a step comes from `edit.bytes()`. Each edit gives an estimate: the number of tiles that it keeps × 256 KB. The estimate is too large when two steps share the same tile. This is safe: the history removes steps too early, not too late.

### Unsaved changes

`history.marker` tells if the document has unsaved changes. The marker is the last edit on the "past" stack that changes the drawing. When the app saves a file, it keeps the marker. Later, if the marker is the same, the drawing is as it was at the save.

This works also with undo: if the user undoes back to the saved state, the marker is again the saved edit. Edits with `outsideDrawing` (for example a palette change) do not change the marker, because they do not change the file.

## Limits

- The history does not keep the active layer. The [editor](/doc/dev/core/editor/) keeps the active layer valid after each change.
- The memory estimate does not see shared tiles. It is an upper limit, not an exact value.
- An edit must not change the drawing outside `apply` and `revert`. If it does, undo gives a wrong state.
