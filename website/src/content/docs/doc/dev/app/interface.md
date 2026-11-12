---
title: Interface components
description: The Svelte components of the editor, how they get their data, and the shared widgets.
sidebar:
  order: 24
---

## Purpose

`src/lib/app/ui/` contains all the Svelte components of the app. The components show the state and send the user's actions. They do not hold the logic: the logic is in the TypeScript modules of `app/` (state, tools, commands, files, layout).

## Files

| Folder              | Content                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/ui/editor/`    | `EditorApp` (the root of the editor) and the large parts it places: `SidePanels`, `EdgeTracks`, `MessageBar`, `EditorDialogs`, `CompactCorner`, `PanelsTab`.                                                       |
| `app/ui/canvas/`    | `CanvasView`: the PixiJS canvas, the pointer events, the brush outline.                                                                                                                                            |
| `app/ui/panels/`    | The content of the panels and columns: `ToolColumn`, `ToolButton`, `NavColumn`, `ColorPanel`, `ColorPicker`, `ShadeBars`, `PalettePanel`, `LayersPanel`, `LayerRow`, `LayerThumb`, `BrushBrowser`, `DocumentInfo`… |
| `app/ui/dialogs/`   | The dialogs: start screen, preferences, command palette, image size, shortcuts, unsaved changes, about…                                                                                                            |
| `app/ui/shell/`     | The window parts: `Titlebar`, `MenuBar`, `WindowButtons`, `LayoutMenu`.                                                                                                                                            |
| `app/ui/widgets/`   | Small reusable controls: `Slider`, `Select`, `Segmented`, `Splitter`, `EdgeColumn`, `PanelMenu`.                                                                                                                   |
| `app/ui/preview/`   | The preview of the whole drawing (see [Preview](/doc/dev/app/preview/)).                                                                                                                                           |
| `app/styles/ui.css` | The base styles of the interface.                                                                                                                                                                                  |

## Concepts

### Svelte components and props

A `.svelte` file is a **component**: a piece of interface with its script, its markup and its styles. A parent gives data to a component with **props**. In Svelte 5, a component reads its props with the `$props()` rune:

```svelte
<!-- src/lib/app/ui/panels/LayerThumb.svelte -->
let { tiles, stamp }: { tiles: ReadonlyTileStore; stamp: number } = $props();
```

A component tells its parent about an action with a **callback prop**. By convention, its name starts with `on`: `onpen`, `oncommand`, `onerror`. The parent gives a function:

```svelte
<CanvasView {editor} onpen={() => prefs.notePen()} oncursor={(p) => (app.cursor = p)} />
```

`{editor}` is a short form of `editor={editor}`.

### Data goes down, actions go up

`EditorApp` makes one `EditorState` (see [Editor state](/doc/dev/app/editor-state/)). It takes the parts it needs from it and gives them to its children as props. The children do not import a global state. Thus, a component shows only what its props give, and a test or a lab page can use it with other data. The stress test page does this: it gives its own `Editor` to `EditorApp` (`initial` prop).

Most actions go back up as a command id: `run("layer.add")`. The command system then does the action (see [Commands](/doc/dev/app/commands/)). Thus, a button, a menu item, a shortcut and the command palette all run the same code.

### Core objects in components

The core (`src/lib/core/`) does not use Svelte. Its objects tell their changes with events (`subscribe`). A component must read them in a reactive way. There are two methods:

- `$effect(() => drawing.subscribe(listener))`: the effect subscribes, and the function it returns unsubscribes when the component closes.
- `Watched` (`app/shared/watched.svelte.ts`): it uses `createSubscriber` from Svelte. When code reads `watched.current` in an effect or a derived value, Svelte subscribes to the object and runs the code again at each event.

### Headless components: Bits UI

Menus, dropdowns and popups use [Bits UI](https://bits-ui.com). Bits UI gives the behavior (keyboard, focus, accessibility, position) without styles. Didi adds its own styles. For example, `Select.svelte` draws a dropdown with Bits UI instead of the native `<select>`: it looks like the rest of the interface, and it does not open GTK popups on Linux.

### Styles

`ui.css` sets the base styles. It uses only the theme variables (`var(--panel)`, `var(--space)`…). The element styles are in `:where()`:

```css
:where(button) { … }
```

`:where()` has a specificity of zero. Thus, any class of a component replaces these base styles, without `!important`.

The component styles are in the `<style>` block of each `.svelte` file. Svelte scopes them to the component.

## How it works

### The editor tree

```
EditorApp
├── CanvasView              the drawing (PixiJS)
├── SidePanels
│   └── PanelColumn         ColorPanel, PalettePanel, LayersPanel
├── PanelsTab               open or close the panels, or select a tab
├── EdgeTracks
│   ├── ToolColumn          ToolButton for each tool
│   └── NavColumn           zoom, fit, rotation, grids, layout menu
├── DocumentInfo            name, size, pixel under the pointer
├── PreviewPopin            (when the preview is "in")
├── MessageBar              messages and work in progress
├── CompactCorner           (compact layout only) undo, redo, selection actions
└── EditorDialogs           all the dialogs
```

`EditorApp` also puts the menus (`MenuBar`) and the tool options (`ToolBar`) into the title bar through `windowTitle` (see [Editor layout](/doc/dev/app/layout/)).

### A new view for each document

```svelte
{#key viewKey}
  <CanvasView {editor} … />
{/key}
```

`{#key}` destroys and makes again its content when the value changes. `viewKey` changes when the document changes or when its size changes. Thus, `CanvasView` makes a new PixiJS view for each document, fitted to the window. There is no code to update an old view for a new document.

### CanvasView

`CanvasView` connects the browser to the rendering and to the input:

1. At mount, it starts a PixiJS `Application` on its `<canvas>`, with WebGL, no antialiasing, and the device pixel ratio as resolution.
2. It makes a `DrawingView` (see the Rendering section) and adds it to the stage.
3. It makes a `CanvasInput` that receives the pointer events and gives them to the painter or to the view navigation.
4. On each frame (`pixi.ticker`), it does three things in sequence:
   - moves the brush outline (`showPointer`),
   - paints the waiting pen samples (`painter.flush()`),
   - sends the changed tiles to the GPU (`view.flush()`).
5. At unmount, it destroys the view and the PixiJS application.

The `CullerPlugin` of PixiJS skips the tiles that are not on the screen.

If the window loses the focus, `CanvasView` ends the stroke: the pen can go up outside the window, and the canvas does not receive this event.

### Dialogs

`EditorDialogs` in `app/state/dialogs.svelte.ts` keeps which dialog is open, as `$state` fields. The component `EditorDialogs.svelte` shows the dialog when its field is true. A command opens a dialog with `dialogs.open(name)`.

A question to the user is a `Promise`. `askUnsaved(name)` opens the dialog and gives a promise. The dialog's buttons resolve it with `"save"`, `"discard"` or `"cancel"`. Thus, the code that asks can `await` the answer:

```ts
const choice = await this.host.askUnsaved(this.name);
```

`dimLayers` counts the open dialogs that make the window dim. The title bar uses it to become dim too.

### Popups over the canvas

A click that closes a popup (a menu, a dropdown) must not draw on the canvas. `app/shared/dismissal.ts` counts the open popups. While a popup is open, and for 250 ms after it closes, `consumeDismissal()` tells the canvas to ignore the contact. The delay is necessary: native pen events can come after the popup is closed.

## Optimizations

### Layer thumbnails

A stroke changes the pixels of a layer on each frame. If the thumbnail is drawn again on each frame, the panel becomes slow.

`LayersPanel` notes the changed layers in a plain `Set`, not in reactive state. When the history changes (for example, at the end of the stroke), it increments a `stamp` for each noted layer. `LayerThumb` draws its thumbnail again only when its `stamp` changes. Thus, a thumbnail updates once for each stroke.

### Color triangle

CSS gradients cannot mix three corners. Thus, `ColorPicker` paints the triangle pixel by pixel in a `<canvas>`. The paint runs again only when the hue or the size changes (`triangleHue` is a separate derived value). A movement inside the triangle does not paint it again.

### Native controls under custom looks

`Slider` puts an invisible native `<input type="range">` over its bar. The browser then handles the pointer, the touch, the keyboard and the accessibility. The component only draws the bar.

## Limits

- No component may contain logic that does not need the DOM. The ESLint rules and `structure.test.ts` keep the components in `ui/` folders and keep logic out of them (see [Tests and code rules](/doc/dev/app/tests/)).
- A source file has a maximum of 400 lines. Large components are split.
