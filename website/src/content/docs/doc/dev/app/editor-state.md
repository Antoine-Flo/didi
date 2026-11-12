---
title: Editor state
description: The object that holds all that the interface shows, and how it stays up to date with the document.
sidebar:
  order: 1
---

## Purpose

`EditorState` holds all that the editor interface shows and changes: the open document, its mode, the tools, the colors, the painter, the shortcuts, the menus, the layout, the dialogs and the messages. The Svelte components read this object and call its methods. They do not keep their own copy of the data.

## Files

| File                                           | Purpose                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/app/state/editor-state.svelte.ts`     | The `EditorState` class. It makes and connects all the other parts.        |
| `src/lib/app/state/editor-changes.svelte.ts`   | Makes the changes of the document visible to Svelte.                       |
| `src/lib/app/state/command-host.ts`            | Gives the app commands access to the state (see [Commands](../commands/)). |
| `src/lib/app/state/dialogs.svelte.ts`          | Which dialog is open, and the questions that wait for an answer.           |
| `src/lib/app/state/messages.svelte.ts`         | The messages at the bottom of the editor.                                  |
| `src/lib/app/state/mode-colors-sync.svelte.ts` | Keeps one set of colors for each mode.                                     |
| `src/lib/app/state/app-update.svelte.ts`       | Finds, downloads and installs a newer version of the app.                  |
| `src/lib/app/tools/tool-state.svelte.ts`       | The active tool, the settings of each tool, the current color.             |
| `src/lib/app/shared/watched.svelte.ts`         | Makes one core object visible to Svelte.                                   |

## Concepts

### Svelte 5 runes

Svelte 5 uses _runes_ for reactivity. A rune is a special function that the Svelte compiler reads. Runes work in `.svelte` files and in `.svelte.ts` files only. This is why the state files have the `.svelte.ts` extension.

| Rune             | What it does                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `$state(v)`      | Makes a value that Svelte watches. When you change it, all that reads it updates.                                                            |
| `$state.raw(v)`  | The same, but Svelte watches only the full value, not the properties inside it. It is faster for large objects that you replace, not change. |
| `$derived(e)`    | A value that Svelte calculates from other reactive values. Svelte calculates it again only when one of these values changes.                 |
| `$effect(f)`     | A function that runs after the interface updates, and again each time a value that it reads changes. It can return a function that stops it. |
| `$effect.pre(f)` | The same, but it runs before the interface updates.                                                                                          |
| `untrack(f)`     | Runs `f` but does not record the values that `f` reads. Thus, a change of these values does not run the effect again.                        |

Svelte records which reactive values a function reads while the function runs. This is _dependency tracking_. You do not write a list of dependencies.

In a class, a field can be a rune:

```ts
// src/lib/app/state/editor-state.svelte.ts
fullScreen = $state(false);
...
this.mode = $derived(this.modes.resolve(this.session.mode));
```

`EditorState` is made inside a component (`EditorApp`) while it initializes. Thus, its `$effect` calls belong to that component, and Svelte stops them when the component goes away.

### The core does not use runes

The code in `src/lib/core` does not know Svelte. When the document changes, it sends events to its subscribers (`drawing.subscribe`, `history.subscribe`, `selection.subscribe`). Svelte cannot see these changes by itself.

`EditorChanges` connects the two. It uses `createSubscriber` from `svelte/reactivity`:

```ts
// src/lib/app/state/editor-changes.svelte.ts
this.history = createSubscriber((update) => history.subscribe(update));
```

`createSubscriber` gives a function. When an effect or a derived value calls this function, Svelte subscribes to the core object. Each time the core sends an event, Svelte runs the effect again. When no effect reads it, Svelte unsubscribes.

Thus, read the document through `EditorChanges`, not directly:

```ts
get history(): History {
  const watched = this.watched();
  watched.history(); // records the dependency
  return watched.editor.history;
}
```

`Watched<T>` (`shared/watched.svelte.ts`) does the same for one object, for example the palette library.

## How it works

### The constructor

The constructor makes the parts in an order where each part has what it needs:

1. `EditorDialogs`: the start screen opens if no document comes back.
2. `Session`: the open document and its file.
3. `editor` and `mode`: derived from the session. When you open a new document, they change.
4. `ToolState`: the tools of the mode. An `$effect.pre` calls `tools.setMode` when the mode changes.
5. `shownTool`: the picker while Alt is held, else the active tool.
6. `Painter`: one painter for the full session. It keeps the brushes that it loaded.
7. `keymap`: derived from the common shortcuts and the shortcuts of the mode.
8. `layout`, `preview`, `view`.
9. `menus`: derived. They show the name of the step to undo, for example "Undo Brush".
10. An effect registers the app commands. Other effects set the window title.

### Mount

`mount()` loads what the editor needs. It runs when the component is in the page. It:

- starts to follow Shift, Ctrl, Alt and the last pointer type,
- loads the brush engine (WebAssembly), then gives it to the painter,
- loads the preferences, the colors of each mode, the theme and the palettes,
- restores the last document (`session.start`),
- looks for an update,
- in the desktop app, asks to save the changes when the user closes the window.

It returns a function that stops all of this.

### Keyboard

`onKeyDown` finds the binding for the key in the keymap, then runs its command. It does nothing when:

- the key goes to a text field (`isTyping`),
- a dialog is open,
- Esc is for the stroke in progress.

If the command exists but is disabled, it does not call `preventDefault`. Thus, Enter can still push a button that has the focus. If the shortcut has no command here (for example Ctrl+S in a mode without files), it calls `preventDefault`. Thus, the browser does not open its own dialog.

### Tool state

`ToolState` holds:

- `options`: the current color, the second color, and the settings of each tool (`$state`).
- `active`: the active tool (`$derived` from its id).
- `inBar`: the tools of the mode, plus the active tool if it comes from another mode.

Each mode remembers its last tool. When you go back to a mode, you get that tool again. `drawingTool` is the last tool that is not the picker. The picker gives the opacity that it takes to this tool.

### Colors of each mode

`ModeColorsSync` keeps the colors (current, second, recent) for each mode. When the mode changes, it saves the colors of the old mode and loads the colors of the new mode. An `$effect` reads `options.color` and `options.secondary`. Thus, it saves them each time they change.

`$state.snapshot` makes a plain copy of a reactive object. Use it before you save or send a reactive value: the stored copy must not change later.

### Messages

`Messages` shows a stack of a maximum of three messages. An information message goes away after six seconds. An error stays until the user closes it. A message with a button also stays. If the same message comes two times in sequence, it shows one time only, and its timer starts again.

### Dialogs

`EditorDialogs` has one `$state` field for each dialog. `dimLayers` counts the open dialogs that make the background darker. `askUnsaved` and `confirm` return a `Promise`. The dialog component calls `answer` or `onconfirm`, and this resolves the promise. Thus, the code that asks can use `await`.

## Limits

- Only one document is open at a time. A new document replaces `session.editor`. `EditorChanges` then makes new subscriptions for it.
- `EditorChanges` does not tell pixel changes with the other changes. Pixels change in each frame of a stroke. Only the code that shows pixels calls `trackPixels()`.
