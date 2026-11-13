---
title: Editor and commands
description: The editing session, the command registry, and the edits of layers and of the full image.
sidebar:
  order: 5
---

## Purpose

The `Editor` class joins the parts of the core into one editing session: a [drawing](/doc/dev/core/document/), its [history](/doc/dev/core/history/), the [selection](/doc/dev/core/selection/) and the active layer. The interface does not change the drawing directly. It runs commands, and the commands use the editor.

## Files

| File                                     | Purpose                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/core/editor/editor.ts`          | `Editor`: the session, the active layer, the selection actions.    |
| `src/lib/core/editor/commands.ts`        | `CommandRegistry`: all the user actions, by name.                  |
| `src/lib/core/editor/editor-commands.ts` | Registers the core commands (layers, selection, image, history).   |
| `src/lib/core/editor/layer-edits.ts`     | Duplicate, merge down, flatten, clear and flip a layer.            |
| `src/lib/core/editor/image-edits.ts`     | Canvas size, crop, trim, scale, rotate and flip of the full image. |
| `src/lib/core/editor/selected-pixels.ts` | Reads, clears and cuts the pixels that a selection covers.         |

## Concepts

### The active layer

The active layer is the layer that the tools paint on. It is a part of the editor, not of the drawing. Thus, it is not in the history: undo does not change the active layer.

But undo can remove the active layer (for example, undo of "Add layer"). After each change of the history, `keepActiveLayerValid` makes sure that the active layer still exists. If it does not exist, the editor selects the layer at the same index, or the layer below it. The editor keeps the last index (`activeIndex`) for this.

### Commands

Each user action is a **command** with a name, for example `"layer.add"` or `"history.undo"`. Shortcuts, menus and the command palette all run commands by name. Thus, one action has one implementation, for all the ways to start it.

```ts
// src/lib/core/editor/editor-commands.ts
registry.register({
  id: "history.undo",
  title: m.cmd_history_undo(),
  enabled: (editor) => editor.history.canUndo,
  run: (editor) => editor.history.undo(),
});
```

A command has:

- `id`: a name with dots. `register` refuses a name that does not match `ID_PATTERN`, or a name that already exists.
- `title`: the text of the menus (from the translated messages `m`).
- `enabled` (optional): if the command can run now. The menus show a disabled command in gray.
- `checked` (optional): for an on/off command, if it is on now.
- `run`: the action.
- `needsParams` (optional): the command cannot run without parameters. The command palette does not show it.

Parameters must be JSON values, so that a shortcut file can keep them. For example, `layer.move` needs `{ index: 2 }`.

`execute(id, params)` calls `enabled` first. If the command is disabled, `execute` returns `false` and does nothing. Each command that changes the drawing pushes its edits to the history itself.

The commands get the editor as their first argument. The app keeps the registry (see [Commands](/doc/dev/app/commands/)).

Many layer commands accept an optional `id`. Without it, they use the active layer. Thus, a shortcut can run them without parameters.

### One user action, one undo step

Many actions make more than one edit. For example, "merge down" writes pixels into the layer below and removes the top layer. The user must undo them in one step. The code uses two methods:

- `group(label, edits)`: one edit that holds others.
- `history.begin(label)` … `history.end()`: all the edits between them become one step.

Before many layer and image edits, the editor must lay the floating content, because the content belongs to a layer that the edit can change. The `step` function in `layer-edits.ts` does this in the same undo step:

```ts
// src/lib/core/editor/layer-edits.ts
function step(editor: Editor, label: string, change: () => void) {
  editor.history.begin(label);
  try {
    if (editor.selection.floating) {
      editor.applySelection();
    }
    change();
  } finally {
    editor.history.end();
  }
}
```

## How it works

### Selection actions

Each selection action makes a new selection state and pushes a `selectionEdit`. This edit keeps the state before, the state after, and the tiles that changed (if any).

| Method               | What it does                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| `applySelection`     | Lays the floating content where it shows. The selection stays.                    |
| `cancelSelection`    | Puts floating content back at its origin. Without content, removes the selection. |
| `deselect`           | Removes the selection. Floating content stays where it shows.                     |
| `selectAll`          | Selects the full canvas.                                                          |
| `invertSelection`    | Selects the pixels that the selection does not cover.                             |
| `selectLayerContent` | Selects the pixels of a layer that are not transparent.                           |
| `transform`          | Lifts the selected pixels, so that the handles can transform them.                |
| `flip`               | Mirrors the selected pixels, or the full layer if there is no selection.          |
| `addLayer`           | Adds an empty layer above the active layer, and makes it the active layer.        |
| `paste`              | Puts an image as floating content on the active layer.                            |
| `pasteAsLayer`       | Puts an image in a new layer above the active layer.                              |
| `clear`              | Makes the selected pixels transparent, or the full layer.                         |
| `copyImage`          | Gives the selected pixels as they show, for the clipboard.                        |

`transform` first cuts the selection down to the pixels that are not transparent (`drawnArea`). Thus, the handles go around the drawing, not around the empty canvas.

`changedTiles(layerId, before, after)` keeps only the tiles that are different. It compares the tile references, not the bytes. This is fast and correct, because the tile store never changes a tile array (see [Tiles](/doc/dev/core/tiles/)): a different tile is always a different array.

`editableLayer(clears)` gives the layer that an edit can change: the layer of the floating content, or the active layer. It gives `null` if the layer is locked. With `clears = true`, it also gives `null` if the layer has the alpha lock, because clearing makes pixels transparent.

### Layer edits

- **Duplicate**: `copyOf` makes a new layer with the same settings. It shares the tiles of the source layer: no pixel is copied.
- **Merge down**: the function makes a temporary drawing with only the two layers. The bottom layer is at full opacity and normal mode. It composites them on the CPU (`composite`), writes the result into the bottom layer and removes the top layer.
- **Flatten**: composites all the visible layers, removes all the layers, and adds one layer with the result. Hidden layers are lost.
- **Clear**: replaces all the tiles of the layer with `undefined` (empty).
- **Flip**: reads the full layer, moves each pixel to its mirrored place, and writes the layer back.

### Image edits

These edits change all the layers, and often the canvas size. `transformImage` does the common work:

1. For each layer, read all its pixels, give them to a `change` function, and put the result into a new tile store of the new size.
2. Take a snapshot of each new store.
3. In one undo step: lay the floating content, remove the selection, and push a `canvasEdit`. A selection has no meaning after the canvas changes.

`canvasEdit` calls `drawing.resizeCanvas`. Undo calls it again with the old size and the old tiles.

| Function       | The `change` function                                                                      |
| -------------- | ------------------------------------------------------------------------------------------ |
| `resizeCanvas` | Moves the pixels by `(dx, dy)`, row by row. Cuts what goes out. New parts are transparent. |
| `crop`         | `resizeCanvas` with the rectangle of the crop.                                             |
| `trim`         | `crop` to the rectangle around the pixels of all layers (`drawnBounds`).                   |
| `rotateImage`  | Moves each pixel to its new place, for 1, 2 or 3 quarter turns.                            |
| `flipImage`    | Mirrors each pixel across the middle of the canvas.                                        |
| `scaleImage`   | Resamples the image to the new size (see below).                                           |

The largest side of a canvas is 8192 pixels (`MAX_CANVAS_SIZE`).

### Scale an image

`scaleImage` uses `resampleNearest`. Each new pixel takes the old pixel under its center. There are no new colors. The function calculates the old column of each new column one time, before the loop.

## Limits

- The active layer is not in the history.
- Image edits read and write all the pixels of all the layers. On a large canvas with many layers, they use a lot of memory for a short time.
- Flatten removes hidden layers.
