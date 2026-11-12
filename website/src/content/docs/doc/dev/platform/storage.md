---
title: Storage
description: App data files, user files, atomic writes and raw IPC bodies.
sidebar:
  order: 2
---

## Purpose

The app keeps two types of files:

- **Data files**: files of the app itself, for example the palettes or the recovery data. They have a short name and the app chooses their place.
- **User files**: the documents of the user, at any path, chosen in a dialog.

`src/lib/platform/storage.ts` gives one API for the two places where the app runs. `src-tauri/src/storage.rs` does the work on the desktop.

## Files

| File                          | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `src/lib/platform/storage.ts` | The JavaScript API.                     |
| `src-tauri/src/storage.rs`    | The Rust commands: read, write, remove. |

## How it works

### Data files

| Function         | Desktop app        | Browser        |
| ---------------- | ------------------ | -------------- |
| `readDataFile`   | `data_read`        | `localStorage` |
| `writeDataFile`  | `data_write`       | `localStorage` |
| `readDataBytes`  | `data_read_bytes`  | IndexedDB      |
| `writeDataBytes` | `data_write_bytes` | IndexedDB      |
| `removeDataFile` | `data_remove`      | both           |

On the desktop, the files are in the app data folder, for example `~/.local/share/<identifier>/` on Linux.

In a browser, text goes into `localStorage`, with the prefix `didi:`. `localStorage` holds strings only and has a small limit (a few MB). Thus, binary data goes into **IndexedDB**, a database of the browser for large values. `binaryStore` opens the database one time and keeps the `Promise`. A write is complete only when the transaction is complete (`oncomplete`), not when the request is complete.

### Only plain names

A data command accepts a plain file name only: letters, digits, `-` and `_`, then one extension.

```rust
// src-tauri/src/storage.rs
ok(stem) && ok(ext)
```

Thus, a name like `../x.json` or `a/b.json` is refused. A data command cannot reach a file outside the app data folder.

### Atomic writes

If the app stops during a write (a crash, no power), the file can be half written. The document is then lost. `write_atomic` prevents this:

1. It writes the contents into a temporary file, `<name>.didi-tmp`, in the same folder.
2. It **renames** the temporary file to the final name.

On the same file system, a rename is atomic: the file has the old contents or the new contents, never a mix. If the rename fails, the function removes the temporary file. Both data files and user files use `write_atomic`.

### Raw IPC bodies

A normal `invoke` sends its arguments as JSON. A `Uint8Array` in JSON becomes an array of numbers, for example `[137,80,78,…]`. This is approximately four times larger and slow to encode and decode.

Thus, the binary writes send the bytes as the **raw body** of the IPC request. The path or the name goes in a **header**:

```ts
// src/lib/platform/storage.ts
await invoke("file_write", bytes, { headers: { path: encodeURIComponent(path) } });
```

A header can contain ASCII only. A path can contain other characters (`é`, spaces). Thus, JavaScript encodes the path with `encodeURIComponent`, and Rust decodes it with `percent_decode`.

For the reads, Rust returns a `tauri::ipc::Response`. It also goes as raw bytes. JavaScript receives an `ArrayBuffer`.

### User files

- `chooseFileToOpen` and `chooseFileToSave` open the dialogs of the system (dialog plugin). They return a path, or `null` if the user cancels.
- `readFile` and `writeFile` call `file_read` and `file_write` with this path.

### Save in a browser

A browser cannot write to a path. `chooseBrowserFile` uses `showSaveFilePicker` when the browser has it (Chromium browsers). The user chooses a place, and the app writes with a `FileSystemFileHandle`.

Other browsers do not have this function. Then the file goes to the downloads: the app makes an object URL and clicks a hidden link.

Call `chooseBrowserFile` immediately after the action of the user, before long work. A browser opens a dialog only during a user action.

## Limits

- In a browser, `localStorage` has a small limit.
- `file_read` and `file_write` accept any path: the path comes from a dialog of the system or from the recent files.
