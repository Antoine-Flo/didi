---
title: Palettes
description: The palette library, its file, the .hex import and the undoable palette edits.
sidebar:
  order: 21
---

## Purpose

A palette is a named list of colors. Didi has built-in palettes (PICO-8, Sweetie 16 and others) and the palettes of the user. The user can add, change and remove the colors of their own palettes.

## Files

| File                                     | Purpose                                                |
| ---------------------------------------- | ------------------------------------------------------ |
| `src/lib/core/color/palette.ts`          | `PaletteLibrary`, the palette file, the `.hex` import. |
| `src/lib/core/color/builtin-palettes.ts` | The built-in palettes.                                 |
| `src/lib/core/color/palette-edits.ts`    | Palette changes as undo steps.                         |
| `src/lib/core/color/palette-sync.ts`     | Links the color picker to the selected palette color.  |

## Concepts

### The library

`PaletteLibrary` holds all the palettes in one list: first the palettes of the user, then the built-in palettes. An index in this list identifies a palette. `isBuiltin(index)` is true when the index is after the palettes of the user.

The library also holds:

- `activeIndex`: the palette that the panel shows.
- `picked`: the place of the color that the user clicked in this palette, or `null`.
- `locked`: when true, the palettes of the user cannot change. This prevents changes by mistake. The library starts locked. The lock is not saved.

`picked` is a **place**, not a color. A palette can contain the same color two times. A place identifies one of them. When a color is added or removed before the picked place, the library moves `picked` to follow the same color.

### Events

The library does not know the interface. It uses an `Emitter` (from `core/shared`). After each change, it calls the listeners of `subscribe`. The interface then updates and saves the file.

## How it works

### The palette file

`toFile()` gives the data to save. It contains only the palettes of the user. The built-in palettes come with the app, thus the file does not need them.

```json
{
  "version": 2,
  "active": "My palette",
  "palettes": [{ "name": "My palette", "colors": ["#1a1c2c", "#5d275d"] }]
}
```

`active` is a **name**, not an index. The list of built-in palettes can change between versions of the app. A name stays correct, an index does not.

`parsePaletteFile` reads this file. It also reads version 1 files. Version 1 kept copies of the built-in palettes and the active palette as an index. `fromVersion1` removes the copies that are equal to a built-in palette and converts the index to a name.

### The .hex import

`parseHexPalette` reads the `.hex` format of Lospec: one color on each line, `rrggbb` or `#rrggbb`. It ignores empty lines. For an incorrect line, it gives an error with the line number.

### Unique names

Two palettes cannot have the same name, because the file identifies the active palette by its name. `uniqueName` adds a number: "Name", then "Name 2", "Name 3" and so on.

### Palette changes and undo

A palette change must be in the same undo history as the drawing. If not, Ctrl+Z would not follow the sequence of the user's actions. Thus, `palette-edits.ts` makes an `Edit` (the undo step type of `core/history`) for each change: `addPaletteColor`, `removePaletteColor`, `changePaletteColor`.

These edits have `outsideDrawing: true`: they do not change the pixels. When the user undoes or redoes one of them, the edit first shows its palette, so the user sees the change. If the user removed the palette since, the edit does nothing.

### Picker and palette, together

`PaletteColorSync` connects the color picker to the palette. When these conditions are true, a change in the picker also changes the palette color:

1. The palettes are unlocked.
2. The shown palette belongs to the user.
3. The current color is the picked color of this palette.

A color that is only equal to a palette color is not enough. The user must click the palette color first.

During a drag in the picker, the palette color changes live. The history gets **one** undo step at the end of the drag (`end`), not one step for each movement. A change without a drag (the hex field, for example) gives one step immediately.

## Limits

- The built-in palettes cannot change. To change one, the user makes a copy.
- The import reads `.hex` files only.
