---
title: Editor layout
description: Where the panels and columns go, the compact layout, and the room left to the canvas.
sidebar:
  order: 23
---

## Purpose

The editor layout calculates where each part of the interface goes:

- the panels column (color, palette, layers), on the left or on the right,
- the two thin columns (the tools, and the view buttons), against an edge,
- the compact layout for small windows,
- the tabs of the panels column when the window is low,
- the room that the panels leave to the canvas.

The panels float **over** the canvas. The canvas always fills the window. Thus, the view must know which parts of the canvas the panels cover.

## Files

| File                                         | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/lib/app/layout/editor-layout.svelte.ts` | `EditorLayout`: all the layout values, derived from the window size and the preferences. |
| `src/lib/app/layout/edge-columns.ts`         | Pure functions: where the thin columns go along an edge.                                 |
| `src/lib/app/layout/window-title.svelte.ts`  | `windowTitle`: what the title bar shows.                                                 |
| `src/lib/app/ui/editor/EditorApp.svelte`     | Binds the elements and the size of the editor to `EditorLayout`.                         |
| `src/lib/app/ui/editor/EdgeTracks.svelte`    | Shows the thin columns at their places.                                                  |
| `src/lib/app/ui/widgets/EdgeColumn.svelte`   | A thin column with a grip to move it.                                                    |

## Concepts

### Edges, not sides

A thin column is against an **edge**: `"panels"` (beside the panels column) or `"opposite"` (against the other edge of the window). The edge is not `"left"` or `"right"`. When the user changes the hand, the panels go to the other side, and the columns go with them. `sideOfEdge` and `edgeOnSide` convert between edges and sides.

The **position** of a column along its edge is a fraction: 0 at the top, 1 at the bottom of the free height. Thus, when the window changes size, the column stays at the same proportion.

### Measured elements

Some values come from the real size of elements in the page. `EditorApp` binds them:

```svelte
<div class="app" bind:clientWidth={layout.width} bind:clientHeight={layout.height}
  bind:this={layout.elements.app}>
```

`bind:clientWidth` updates `layout.width` when the element changes size. `bind:this` gives the DOM element. `EditorLayout` then calculates the other values with `$derived`.

## How it works

### Compact layout

The window is small below 900 × 600 pixels, multiplied by the interface size:

```ts
// src/lib/app/layout/editor-layout.svelte.ts
const smallWindow = $derived(
  this.width > 0 &&
    (this.width < COMPACT_WIDTH * this.uiScale || this.height < COMPACT_HEIGHT * this.uiScale),
);
this.compact = $derived(this.prefs.compact === "auto" ? smallWindow : this.prefs.compact === "on");
```

In the compact layout:

- the menus are behind one button,
- the view column and the document information are not shown,
- undo and redo float in a corner (`CompactCorner.svelte`),
- the panels column starts closed, and shows one tab at a time.

When the layout becomes compact, an effect closes the panels column. The open state in compact layout is not saved. Out of the compact layout, the user's choice (`prefs.panelsOpen`) applies.

### Tabs

Below 560 pixels of column height, the panels column shows one tab at a time: the color with the palette, or the layers (`tabbed`, `panelTab`).

### Menus that collapse

The title bar holds the menus, then the options of the tool. If the options do not fit, `toolbarLacking` gives the missing width. Then the menus collapse behind one button. The layout keeps the window width that the options need (`menusWidthNeeded`). The menus come back only when the window is this wide again. Without this rule, the menus collapse and expand again and again: expanded menus take the room, the options do not fit, the menus collapse, the options fit, the menus expand…

A change of tool tries the menus again, because the new tool can have fewer options.

### Placing the thin columns

`columnTops(edgeHeight, columns, gap)` in `edge-columns.ts` gives the top of each column on one edge:

1. Each column goes where its position puts it: `position × (edgeHeight − height)`.
2. Going down from the top, each column moves below the column before it, plus the gap.
3. Going up from the bottom, each column moves above the column after it, and stays inside the edge.

Two passes are necessary: the first pass removes overlaps, but can push a column past the bottom. The second pass pushes the columns back up. The tops are rounded to whole pixels. A fractional position makes the icons blurred.

When the user drops a column, `dropColumn` finds the nearest side (from the middle of the column), converts it to an edge, and calculates the new position (`positionOnEdge`).

### Room for the canvas

`insets()` gives, for each side, how far the floating parts go over the canvas:

```ts
for (const element of floating) {
  const rect = element.getBoundingClientRect();
  if (nearestSide(rect, box) === "left") {
    left = Math.max(left, rect.right - box.left);
  } else {
    right = Math.max(right, box.right - rect.left);
  }
}
```

The view uses these insets to fit the drawing in the part of the canvas that is not covered (see [View navigation](/doc/dev/app/view-navigation/)).

### The title bar

The window has no system title bar. The app draws its own (`Titlebar.svelte`). `windowTitle` is a shared `$state` object. The page that shows puts its content in it:

- `menu`, `center`, `end`: Svelte snippets (pieces of markup) to show in the bar.
- `name`, `dirty`: the title.
- `dimLayers`: the number of open dialogs. The bar becomes dim like the rest of the window.
- `hidden`: the page has its own bar (the preview window).

The editor sets these values in an effect, and puts them back when it closes.

### Interface size

An effect sets `--ui-scale` on the root element. All the sizes of the theme use it (see [Preferences and theme](/doc/dev/app/preferences/)). The saved panel sizes are at 100 %. `scaledSize` converts them to CSS with the same factor.

## Limits

- The layout reads sizes from the DOM. Thus, most of `EditorLayout` needs a browser to run. The pure parts are in `edge-columns.ts`.
- The panels column is between 180 and 480 pixels wide, and a maximum of half the window.
