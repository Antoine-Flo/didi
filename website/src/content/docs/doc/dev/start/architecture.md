---
title: Architecture
description: The parts of Didi, and how they connect.
---

Didi is a pixel art editor. One code base gives two apps:

- **The desktop app**: a [Tauri](https://tauri.app) window. Tauri shows the web interface in the webview of the system, and adds a small Rust part for the access to the system.
- **The web app**: the same interface, in a browser, at `/app`.

The interface is a [SvelteKit](https://svelte.dev/docs/kit) app, written in TypeScript and Svelte 5. [PixiJS](https://pixijs.com) shows the canvas with the GPU.

## The folders

| Folder        | Contents                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| `src/lib/`    | All the code of the app, in layers (see below).                            |
| `src/routes/` | The pages: `/` (landing page), `/app` (the editor), `/lab` (test pages).   |
| `src-tauri/`  | The Rust part of the desktop app: file storage, native pen input on Linux. |
| `messages/`   | The texts of the interface (`en.json`).                                    |
| `static/`     | Files served as they are: icons.                                           |
| `tools/`      | Scripts for development: builds.                                           |
| `website/`    | The documentation site (Astro): the user guide and these pages.            |

## The layers

The code in `src/lib/` has three layers. A layer can use the layers below it. It cannot use the layers above it.

```
app        tools, input, state of the editor, interface (Svelte)
 │
 ├── render     the canvas view (PixiJS)
 ├── platform   the access to the system (Tauri or browser)
 │
core       the document, the history, the selection, the colors, the files
```

`lab` is one more folder. Only the `/lab` pages use it.

### Why layers

Layers keep each part simple to understand and to test:

- `core` has no interface and no GPU. Thus, the tests can run it in Node.js, without a browser.
- Only `platform` knows Tauri. The rest of the code asks `platform` for a file or a window, and does not know if it runs in Tauri or in a browser.
- The logic does not import Svelte components. Components are only in the `ui/` folders.

ESLint makes sure that the code obeys these rules. Each layer has a `no-restricted-imports` rule in `eslint.config.js`:

```js
// eslint.config.js
// Dependencies go one way: core, then render and platform, then app; lab only for
// the lab pages. Tauri stays in platform.
```

If an import breaks a rule, `npm run lint` fails.

## The main objects

A small number of objects hold the state of the app. Learn these first.

| Object        | File                                       | Holds                                                                                     |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Drawing`     | `src/lib/core/document/drawing.ts`         | The size, the layers and their pixels. It tells the other objects when something changes. |
| `Editor`      | `src/lib/core/editor/editor.ts`            | One drawing, its history (undo, redo), its selection, its commands and the active layer.  |
| `EditorState` | `src/lib/app/state/editor-state.svelte.ts` | All that the interface shows: the editor, the tools, the colors, the layout, the dialogs. |
| `Painter`     | `src/lib/app/input/painter.ts`             | Connects the pen to the active tool.                                                      |
| `DrawingView` | `src/lib/render/drawing-view.ts`           | Shows the drawing on the GPU.                                                             |

The data goes in one direction. The tools change the `Drawing`. The `Drawing` sends a change event. The `DrawingView` receives the event and updates the GPU. The tools never update the view directly.

## How the app starts

1. The browser (or the Tauri webview) opens `/app`. `src/routes/(app)/+layout.ts` sets `ssr = false`: the app runs in the browser only, because it needs the DOM from the start.
2. `src/routes/(app)/app/+page.svelte` shows `EditorApp`.
3. `EditorApp` makes the `EditorState`. `EditorState` starts with a new document. Then `session.start()` loads the recent files. In a browser, it also brings back the document of the last visit.
4. `CanvasView` (`src/lib/app/ui/canvas/CanvasView.svelte`) makes the PixiJS application and the `DrawingView`, and starts the frame loop.

## The frame loop

The app does most of its work in one loop, one time for each frame of the screen (about 60 times a second). PixiJS calls it (`pixi.ticker`):

```ts
// src/lib/app/ui/canvas/CanvasView.svelte
pixi.ticker.add((ticker) => {
  showPointer();
  painter?.flush();
  view?.flush();
  // ...
});
```

1. `showPointer` moves the pointer to the last pen position.
2. `painter.flush()` asks the stroke in progress to put its latest changes in the drawing.
3. `view.flush()` sends the changed pixels to the GPU.

Why a loop? A pen can send hundreds of events each second, more than the screen can show. If the app updates the drawing and the GPU at each event, the interface stops. The app thus collects the changes, and shows them one time for each frame. The page [From pen to screen](/doc/dev/start/from-pen-to-screen/) shows the full path of a stroke.
