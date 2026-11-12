---
title: Architecture
description: The parts of Didi, and how they connect.
---

Didi is a drawing app for painting and pixel art. One code base gives two apps:

- **The desktop app**: a [Tauri](https://tauri.app) window. Tauri shows the web interface in the webview of the system, and adds a small Rust part for the access to the system.
- **The web app**: the same interface, in a browser, at `/app`.

The interface is a [SvelteKit](https://svelte.dev/docs/kit) app, written in TypeScript and Svelte 5. [PixiJS](https://pixijs.com) shows the canvas with the GPU. [libmypaint](https://github.com/mypaint/libmypaint), compiled to WebAssembly, paints the brush strokes.

## The folders

| Folder            | Contents                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `src/lib/`        | All the code of the app, in layers (see below).                            |
| `src/routes/`     | The pages: `/` (landing page), `/app` (the editor), `/lab` (test pages).   |
| `src-tauri/`      | The Rust part of the desktop app: file storage, native pen input on Linux. |
| `native/mypaint/` | The C code and the script that compile libmypaint to WebAssembly.          |
| `messages/`       | The texts of the interface (`en.json`).                                    |
| `static/`         | Files served as they are: icons, brush previews.                           |
| `tools/`          | Scripts for development: builds, brush comparison.                         |
| `website/`        | The documentation site (Astro): the user guide and these pages.            |

## The layers

The code in `src/lib/` has four layers. A layer can use the layers below it. It cannot use the layers above it.

```
app        tools, input, state of the editor, interface (Svelte)
 │
 ├── render     the canvas view (PixiJS)
 ├── mypaint    the brush engine (libmypaint)
 ├── platform   the access to the system (Tauri or browser)
 │
core       the document, the history, the selection, the colors, the files
```

`lab` is a fifth folder. Only the `/lab` pages use it.

### Why layers

Layers keep each part simple to understand and to test:

- `core` has no interface and no GPU. Thus, the tests can run it in Node.js, without a browser.
- Only `platform` knows Tauri. The rest of the code asks `platform` for a file or a window, and does not know if it runs in Tauri or in a browser.
- The logic does not import Svelte components. Components are only in the `ui/` folders.

ESLint makes sure that the code obeys these rules. Each layer has a `no-restricted-imports` rule in `eslint.config.js`:

```js
// eslint.config.js
// Dependencies go one way: core, then render, mypaint and platform, then app; lab only for
// the lab pages. Tauri stays in platform.
```

If an import breaks a rule, `npm run lint` fails.

## The main objects

A small number of objects hold the state of the app. Learn these first.

| Object        | File                                       | Holds                                                                                               |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `Drawing`     | `src/lib/core/document/drawing.ts`         | The size, the layers and their pixels. It tells the other objects when something changes.           |
| `Editor`      | `src/lib/core/editor/editor.ts`            | One drawing, its history (undo, redo), its selection, its commands and the active layer.            |
| `EditorState` | `src/lib/app/state/editor-state.svelte.ts` | All that the interface shows: the editor, the mode, the tools, the colors, the layout, the dialogs. |
| `Painter`     | `src/lib/app/input/painter.ts`             | Connects the pen to the active tool.                                                                |
| `DrawingView` | `src/lib/render/drawing-view.ts`           | Shows the drawing on the GPU.                                                                       |
| `MyPaint`     | `src/lib/mypaint/engine.ts`                | The brush engine.                                                                                   |

The data goes in one direction. The tools change the `Drawing`. The `Drawing` sends a change event. The `DrawingView` receives the event and updates the GPU. The tools never update the view directly.

## How the app starts

1. The browser (or the Tauri webview) opens `/app`. `src/routes/(app)/+layout.ts` sets `ssr = false`: the app runs in the browser only, because it needs the DOM from the start.
2. `src/routes/(app)/app/+page.svelte` shows `EditorApp`.
3. `EditorApp` makes the `EditorState`. `EditorState` opens the last document or a new one, and starts to load the brush engine (`loadMyPaint()`).
4. `CanvasView` (`src/lib/app/ui/canvas/CanvasView.svelte`) makes the PixiJS application and the `DrawingView`, and starts the frame loop.

## The frame loop

The app does most of its work in one loop, one time for each frame of the screen (about 60 times a second). PixiJS calls it (`pixi.ticker`):

```ts
// src/lib/app/ui/canvas/CanvasView.svelte
pixi.ticker.add((ticker) => {
  showPointer(performance.now());
  painter?.flush();
  view?.flush();
  // ...
});
```

1. `showPointer` moves the pointer to its last position.
2. `painter.flush()` paints the pen samples that wait, for about 8 ms maximum.
3. `view.flush()` sends the changed pixels to the GPU.

Why a loop? A pen can send hundreds of events each second, more than the screen can show. If the app paints and uploads at each event, the interface stops. The app thus collects the events, and does the work one time for each frame. The page [From pen to screen](/doc/dev/start/from-pen-to-screen/) shows the full path of a stroke.
