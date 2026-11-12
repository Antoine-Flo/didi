---
title: Modes
description: Pixel art and Painting, and how a mode changes the editor.
sidebar:
  order: 20
---

## Purpose

A mode sets what the editor shows for one type of work. Didi has two modes: **Pixel art** and **Painting**.

A mode does not change how a tool works. All the tools are available in all the modes, from the command palette. A mode only selects:

- the tools in the tool bar,
- the default size and background of a new document,
- the default content of the color panel,
- some shortcuts,
- some behaviors of the view (zoom steps, rotation with two fingers).

The layout does not change with the mode. The panels stay at the same place.

## Files

| File                                       | Purpose                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| `src/lib/app/modes/mode.ts`                | The `Mode` type and the `ModeRegistry`.                    |
| `src/lib/app/modes/builtin.ts`             | The two modes of Didi: `PIXEL_MODE` and `PAINTING_MODE`.   |
| `src/lib/app/shared/registry.ts`           | `Registry`: a list of definitions by id. Tools use it too. |
| `src/lib/app/files/session.svelte.ts`      | Keeps the mode of the open document (`Session.mode`).      |
| `src/lib/app/state/editor-state.svelte.ts` | Finds the `Mode` object and gives it to the other parts.   |

## Concepts

### A mode is data

A mode is a plain object. It has no methods and no state. This is a part of the type in `mode.ts`:

```ts
export interface Mode {
  readonly id: string;
  readonly tools: readonly string[];
  readonly eraserTool: string;
  readonly smoothScaling: boolean;
  readonly touchRotation: boolean;
  readonly pixelZoom: boolean;
  readonly colorPanel: ColorPanelPrefs;
  readonly bindings: readonly Binding[];
  // …
}
```

Because a mode is data, other code reads the flags. For example, the view navigation reads `pixelZoom`, and the image size dialog reads `smoothScaling`.

### The registry

A `Registry` keeps definitions by their `id`, in the sequence of registration. `register` refuses a second item with the same id. It returns a function that removes the item. Thus, code that is not part of Didi (a plugin) can add a mode the same way as the built-in modes.

`ModeRegistry.resolve(id)` gives the mode with this id. If the id is unknown, it gives the default mode (`"painting"`). Thus, a file that refers to a missing mode still opens.

## How it works

1. `createModeRegistry()` registers the built-in modes.
2. The `Session` keeps the mode id of the open document. The `.didi` file saves this id.
3. `EditorState` makes a derived value: `this.mode = $derived(this.modes.resolve(this.session.mode))`. When the id changes, the `Mode` object changes.
4. An effect tells the tools about the new mode (`tools.setMode`). The first tool of `mode.tools` becomes active.
5. The keymap adds the mode's `bindings` after the common shortcuts. Thus, the shortcuts of the mode win.
6. The colors of each mode are different (see [Preferences](/doc/dev/app/preferences/)). A change of mode loads the colors of the new mode.

A change of mode is an unsaved change of the document. It is not an undo step (`Session.setMode`).

## The flags

| Flag               | Pixel art   | Painting                        | Effect                                                              |
| ------------------ | ----------- | ------------------------------- | ------------------------------------------------------------------- |
| `smoothScaling`    | `false`     | `true`                          | The image size dialog mixes pixels, or keeps them whole.            |
| `touchRotation`    | `false`     | `true`                          | Two fingers can turn the view.                                      |
| `pixelZoom`        | `true`      | `false`                         | Zoomed out, the zoom uses whole steps (see `render/pixel-zoom.ts`). |
| `showsCursorPixel` | `true`      | `false`                         | The document information shows the pixel under the pointer.         |
| `colorPanel`       | square only | triangle, shades, recent colors | The default content of the color panel.                             |

### Why `pixelZoom` exists

At a zoom of 150 %, one canvas pixel can take 1 device pixel and the next pixel can take 2. Pixel art then looks uneven. Thus, in Pixel art mode, below 8 device pixels for each canvas pixel, the zoom uses only whole levels: 1, 2, 3… device pixels, or 1/2, 1/3… below 1. Above 8, a difference of one device pixel is not visible, and the zoom is free.

## Limits

- The mode is for one document. Two documents cannot be open at the same time.
- `DEFAULT_MODE` (`"painting"`) applies to files without a mode. `START_MODE` (`"pixel"`) applies to the first new document.
