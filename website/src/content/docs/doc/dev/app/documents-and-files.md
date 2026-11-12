---
title: Documents and files
description: The open document, open and save, the file worker, the recovery copy and the recent files.
sidebar:
  order: 21
---

## Purpose

This part of the code manages the open document as a file:

- new, open, save, save as, PNG export,
- unsaved changes,
- the recovery copy after a crash,
- the list of recent files,
- the import of images and palettes.

It does not read or write the bytes of the `.didi` format. The core does that (`src/lib/core/file/`). It does not access the disk directly. The platform layer does that (`src/lib/platform/storage.ts`).

## Files

| File                                              | Purpose                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/app/files/session.svelte.ts`             | `Session`: the open document, its file, its mode, and all file actions. |
| `src/lib/app/files/files.ts`                      | Calls the file worker. Reads and writes files.                          |
| `src/lib/app/files/file-worker.ts`                | The worker: encodes and decodes `.didi` and PNG files.                  |
| `src/lib/app/files/document-files.ts`             | Asks the user for a file to open, to save, or to export to.             |
| `src/lib/app/files/saved-state.ts`                | What the document was at the last save, to find unsaved changes.        |
| `src/lib/app/files/recovery-copy.svelte.ts`       | The recovery copy.                                                      |
| `src/lib/app/files/recent.ts`                     | The recent files (`recent.json`).                                       |
| `src/lib/app/files/new-drawing.ts`                | Makes a new empty `Editor`.                                             |
| `src/lib/app/files/new-document-choice.svelte.ts` | The mode, size and background chosen in the start screen.               |
| `src/lib/app/files/import-image.ts`               | Adds an image file as a layer, or a `.hex` file as a palette.           |
| `src/lib/app/files/palette-storage.ts`            | Loads and saves the user's palettes (`palettes.json`).                  |
| `src/lib/app/files/release-notes.ts`              | Reads the notes of the versions after the running one.                  |
| `src/lib/app/shared/data-file.ts`                 | `DataFile`: a JSON file of the app, saved after a short delay.          |

## Concepts

### User files and app data files

Didi uses two types of files:

- **User files**: the `.didi` and `.png` files that the user selects. Only the desktop app can use paths (`canUseFiles()`).
- **App data files**: files that Didi keeps for itself (preferences, palettes, recent files, the recovery copy). The platform layer puts them in the app data folder. In a browser, text files go into `localStorage`, and binary files go into IndexedDB.

`localStorage` is a small key-value store of the browser, for text only. IndexedDB is a database of the browser that can keep large binary data. The code in `app/` does not know which one is in use. It only calls `readDataFile`, `writeDataBytes` and the other functions of `platform/storage.ts`.

### Web workers and Comlink

JavaScript runs the interface on one thread. A long calculation on this thread stops the interface: the pen and the buttons do not respond. The encoding of a `.didi` file compresses all the tiles to PNG, and that can take a long time.

Thus, Didi does this work in a **web worker**: a second JavaScript thread, without access to the page. The two threads cannot share objects. They send messages.

[Comlink](https://github.com/GoogleChromeLabs/comlink) hides the messages. The worker exposes an object, and the page calls its methods as if they were local `async` functions:

```ts
// src/lib/app/files/files.ts
worker ??= Comlink.wrap<FileWorker>(
  new Worker(new URL("./file-worker.ts", import.meta.url), { type: "module" }),
);
```

The worker starts at the first call only (`??=`).

### Transfer, not copy

A message copies its data by default. A document of many layers can have hundreds of megabytes of tiles. A copy takes time and doubles the memory.

`Comlink.transfer` moves an `ArrayBuffer` to the other thread instead. After the move, the sender cannot use the buffer. The move is almost free.

- `decodeDocument` transfers the bytes of the file to the worker. The page does not need them after.
- The worker transfers the decoded tiles back to the page (`tileBuffers` in `file-worker.ts`).
- `encodeDocument` does **not** transfer the tiles to the worker. The editor still uses them. They are copied.

## How it works

### The Session

`Session` (`session.svelte.ts`) holds the open document. Its fields are Svelte state (`$state`), so the interface updates when they change:

- `editor`: the document and its history.
- `path`, `name`: the file of the document, `null` before the first save.
- `mode`, `grid`: also saved in the file.
- `busy`: the label of a file action in progress, for example "Saving…".
- `recent`, `recovery`: for the start screen.

All file actions go through `Session.run(label, failure, action)`. It sets `busy`, runs the action, and shows a message if the action fails. Thus, each action has the same error handling.

### Unsaved changes

The history has a `marker`: the last edit of the drawing in the undo list (`History.marker` in `core/history/history.ts`). At each save, the session keeps a `SavedState`: the marker, the mode, the grid and the hidden layers.

```ts
// src/lib/app/files/session.svelte.ts
get dirty(): boolean {
  void this.revision;
  return (
    this.editor.history.marker !== saved.marker ||
    this.mode !== saved.mode ||
    !sameGrid(this.grid, saved.grid) ||
    this.editor.drawing.layers.some((l) => l.visible === saved.hidden.has(l.id))
  );
}
```

This comparison is fast: it does not compare pixels. If the user undoes the changes back to the saved state, the last edit is the same as at the save, and the document is not dirty.

A recovered document has changes that no file has. Thus, `replace` sets its saved marker to a new empty object (`marker: {}`). No edit is equal to it, and the document stays dirty.

The visibility of a layer is not an undo step, but the file saves it. Thus, `SavedState` keeps the hidden layers too.

`revision` is a counter. The session increments it at each change of the history or of the visibility. `dirty` reads it, so Svelte calculates `dirty` again when it changes.

### Save

1. `save()` uses the current path. If there is no path, it calls `saveAs()`, which asks for a file.
2. `saveTo(path)` takes a snapshot of the document (`documentFromEditor`) and of the `SavedState`, **before** the save starts. Changes made during the save stay unsaved.
3. The worker encodes the `.didi` file and a small preview image.
4. The platform writes the file.
5. The session sets the new `saved` state, removes the recovery copy, and adds the file to the recent files with its preview.

### Open

1. `confirmDiscard()` asks the user what to do with unsaved changes: save, discard or cancel.
2. The platform reads the bytes. The worker decodes them into a `DocumentData`.
3. `editorFromDocument` makes a new `Editor`. `replace` puts it in the session with its mode, grid and extensions.

### The recovery copy

The recovery copy keeps the changes if the app stops unexpectedly. It is not the user's file.

1. After each change, `RecoveryCopy.schedule()` starts a timer.
2. When the timer ends, the copy is encoded and written to `recovery.didi`, with `recovery.json` (name, path, time).
3. A save or a normal close removes the copy.
4. At the next start, if a copy is there, the previous session did not close normally. `setAsideLeftCopy()` moves it to `recovery-previous.didi`. The start screen offers it until the user opens or discards it.

In a browser, there are no user files. The copy is the only save of the document. It stays when the tab closes, and the next start opens it automatically (`restoreCopy`).

**Optimizations and safety:**

- The delay is 3 seconds, or 10 times the duration of the last write if that is longer. Thus, a large document uses a maximum of about 10 % of the time to write its copy.
- One write or removal runs at a time, in sequence (`inOrder`). An old write cannot finish after a new one and replace it.
- If the user undoes all changes, the next write removes the copy instead.
- `recover()` writes the copy of the new session **before** it removes the old copy. Thus, at all times, one copy exists.

### App data files with a delay

`DataFile` (`shared/data-file.ts`) is a JSON file of the app: layout, theme, colors, palettes. It has two rules:

- It saves 300 ms after the **last** change, not at each change. A slider sends many changes in one second.
- It never saves before the file is read. Otherwise, the default values replace the user's file at start.

Call `flush()` before the app closes, to save the changes that wait for the delay.

### The recent files

`recent.json` keeps a maximum of 8 files. `withRecent` puts the new file first and removes the same path lower in the list. Each entry has a small PNG preview as a data URL, so the start screen shows it without access to the file.

`parseRecent` removes entries that are not valid. An app data file can be old or damaged: it must not stop the app.

### Import

`importFiles` (`import-image.ts`) receives the files dropped on the editor:

- A `.hex` file becomes a palette.
- An image becomes a new layer, at the center. The browser decodes it (`createImageBitmap`), then `premultiply` converts the pixels to premultiplied alpha, the format of the layers.

The new layer and its pixels are one undo step: `history.begin()` and `history.end()` group the two edits.

## Limits

- Only the desktop app can open and save `.didi` files with a path. In a browser, the recovery copy keeps the document, and PNG export uses a download (`chooseBrowserFile`).
- One document is open at a time.
- The encoding copies the tiles to the worker. During a save, the memory of the tiles is temporarily double.
