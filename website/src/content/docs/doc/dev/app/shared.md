---
title: Shared helpers
description: Small helpers that many parts of the app use.
sidebar:
  order: 10
---

## Purpose

`src/lib/app/shared` has small helpers that many parts of the app use. They do not belong to one feature.

## Files

| File                | Purpose                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `registry.ts`       | A set of items by id, in registration order (tools, modes).                       |
| `watched.svelte.ts` | Makes one core object visible to Svelte.                                          |
| `data-file.ts`      | A JSON file in the app data folder, saved a short time after a change.            |
| `dismissal.ts`      | Ignores the click that closes a menu above the canvas.                            |
| `pointer-drag.ts`   | A drag on an element of the color panel.                                          |
| `popup-padding.ts`  | Keeps popups away from the window edges and the title bar.                        |
| `feedback-links.ts` | The URLs of the bug form, the feedback form, the community and the documentation. |
| `error-message.ts`  | The text of an error, for a message to the user.                                  |

## How it works

### Registry

`Registry<T>` is a `Map` by id. `register(item)` returns a function that removes this item. It throws an error if the id already exists. `get(id)` throws if the id does not exist. `list()` gives the items in registration order. The built-in tools and modes use it as other items would: a plugin could add its own.

### Watched

The core objects tell their changes with `subscribe`, not with runes. `Watched<T>` holds one such object in a `$state.raw`. Its `current` getter calls a `createSubscriber` function. Thus, an effect that reads `current` runs again when the object tells a change. See [Editor state](../editor-state/).

### DataFile

Preferences, colors and palettes are JSON files in the app data folder. `DataFile`:

- **Debounce.** `scheduleSave()` waits `SAVE_DELAY_MS` (300 ms) after the last change, then saves. If a new change comes before, the timer starts again. Thus, a slider that moves does not write the file 60 times each second.
- **Read first.** It never saves before the file was read (`markLoaded`). If it saves first, it writes the defaults over the file of the user.
- **Flush.** `flush()` saves now if a save waits. The app calls it before it closes.

Each owner reads and checks the contents itself. Only the owner knows what they mean.

### Dismissal

When a menu above the canvas closes, the same click must not draw. Popups call `popupOpened()` and `popupClosed()`. `consumeDismissal()` returns `true` while a popup is open and for 250 ms after it closes. The input code calls it at each press on the canvas (see [Input](../input/)).

### Pointer drag

`pointerDrag({ update, ... })` returns event handlers for an element. On `pointerdown`, it captures the pointer. On each move, it gives the position in the element from 0 to 1 on each axis. By default, it clamps the position to the edges. Thus, a color square still works when the pointer goes outside it.

### Popup padding

`popupPadding()` gives the space that popups keep from the window edges (8 pixels) and from the title bar. The title bar height is a CSS token (`var(--titlebar-height)`). Only the browser can calculate it. Thus, `cssLength` adds a hidden element with this height, reads its size, then removes it.

### Feedback links

The bug form gets some facts in its URL as hidden fields: the version, the system, and the state of the editor (last pointer, mode, tool, document size, screen, layout, last error). These facts help to find the bug. They do not identify the user.
