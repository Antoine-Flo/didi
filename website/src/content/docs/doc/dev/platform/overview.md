---
title: Desktop and web
description: How one code base runs in a browser and in the Tauri desktop app.
sidebar:
  order: 1
---

## Purpose

Didi runs in two places: in a browser, and as a desktop app made with **Tauri**. The code of the app is the same in the two places. The `src/lib/platform` folder contains all the code that is different. The other folders do not know where the app runs.

## Files

| File                                  | Purpose                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/platform/capabilities.ts`    | What the app can do where it runs.                                         |
| `src/lib/platform/storage.ts`         | Data files and user files (see [Storage](/doc/dev/platform/storage/)).     |
| `src/lib/platform/pen.ts`             | Native pen events (see [Native pen input](/doc/dev/platform/native-pen/)). |
| `src/lib/platform/window.ts`          | The window of the app, full screen.                                        |
| `src/lib/platform/preview-window.ts`  | The preview in its own window.                                             |
| `src/lib/platform/clipboard.ts`       | Images in the system clipboard.                                            |
| `src/lib/platform/open-link.ts`       | Opens a web page.                                                          |
| `src/lib/platform/system.ts`          | The system and the browser, from the user agent.                           |
| `src/lib/platform/updater.ts`         | Updates of the desktop app (see [Updates](/doc/dev/platform/updater/)).    |
| `src-tauri/src/lib.rs`                | The Rust side: plugins and commands.                                       |
| `src-tauri/capabilities/default.json` | The permissions of the windows.                                            |

## Concepts

### What Tauri is

A Tauri app has two parts:

1. A **webview**: a browser engine without the browser interface. It runs the HTML, CSS and JavaScript of the app. On Linux, the webview is WebKitGTK.
2. A **Rust process**. It opens the windows and can do what a web page cannot: read any file, read the raw events of a tablet.

The two parts talk with **IPC** (inter-process communication).

### IPC: commands and channels

JavaScript calls a Rust function with `invoke`:

```ts
// src/lib/platform/storage.ts
return invoke<string | null>("data_read", { name });
```

In Rust, the function has the `#[tauri::command]` attribute. `lib.rs` registers all the commands with `generate_handler!`. The arguments and the result go as JSON. A `Result::Err` in Rust becomes a rejected `Promise` in JavaScript.

For events that Rust sends many times, JavaScript gives a `Channel` to a command. Rust then sends messages into the channel (see [Native pen input](/doc/dev/platform/native-pen/)).

### Permissions

A Tauri plugin function (dialogs, clipboard, window buttons) is blocked by default. `src-tauri/capabilities/default.json` lists the permissions of the `main` and `preview` windows, for example `dialog:allow-open` or `clipboard-manager:allow-read-image`. A missing permission gives an error at run time.

The commands of Didi itself (`data_read`, `tablet_subscribe`…) do not need a line in this file.

### One name for each difference

The interface does not call `isTauri()` to decide what to show. It reads `capabilities`:

```ts
// src/lib/platform/capabilities.ts
export const capabilities = {
  ownWindow: isTauri(),
  windows: isTauri(),
  userFiles: isTauri(),
} as const;
```

Each difference has a name. When you read `capabilities.userFiles`, you know why the code is different. If a new platform comes (a mobile app, for example), you change the values in one place.

### The ESLint rule

`eslint.config.js` refuses an import of `@tauri-apps/*` outside `src/lib/platform`. Thus, the Tauri code cannot spread into the rest of the app.

## How it works

The functions of `platform` have the same signature in the two places. Inside, they choose the implementation:

| Function              | Desktop app                    | Browser                                      |
| --------------------- | ------------------------------ | -------------------------------------------- |
| `readDataFile`        | Rust command `data_read`       | `localStorage`                               |
| `readDataBytes`       | Rust command `data_read_bytes` | IndexedDB                                    |
| `writeClipboardImage` | Tauri clipboard plugin         | Clipboard API, as a PNG                      |
| `openLink`            | System browser (opener plugin) | `window.open` in a new tab                   |
| `setFullScreen`       | Tauri window                   | Fullscreen API on the page                   |
| `openPreviewWindow`   | A second `WebviewWindow`       | not available: the preview stays in the page |

### Clipboard

In the desktop app, the clipboard of the webview is not reliable for images. Thus, `clipboard.ts` uses the Tauri plugin. The plugin gives raw RGBA. In a browser, the Clipboard API wants a PNG `Blob`. To read, the browser decodes the image with `createImageBitmap` and an `OffscreenCanvas`.

### System information

`systemInfo()` reads the user agent and gives names only, without versions. The order of the tests is important: most browsers write "Chrome" and "Safari" in their user agent. An iPad writes "Macintosh". Thus, `systemInfo` uses the touch points to find iPads.

## Limits

- Native pen events exist only on Linux.
- User files (open, save, recent files) need the desktop app.
