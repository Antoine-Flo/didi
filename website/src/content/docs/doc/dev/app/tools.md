---
title: Tools
description: What a tool is, how tools are registered, and the parts that all tools share.
sidebar:
  order: 5
---

## Purpose

A tool is a definition: a title, an icon, settings, the controls of the tool bar, the outline under the pointer, and what happens when the pen goes down. The painter runs the active tool and does not know which one it is. All tools, also the built-in tools, are registered in the same way.

## Files

| File                                     | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/app/tools/tool.ts`              | The `Tool` interface, `ToolRegistry`, the size slider.                   |
| `src/lib/app/tools/builtin.ts`           | The list of built-in tools.                                              |
| `src/lib/app/tools/tool-state.svelte.ts` | The active tool and the settings (see [Editor state](../editor-state/)). |
| `src/lib/app/tools/tool-groups.ts`       | Tools that share one button of the tool column.                          |
| `src/lib/app/tools/brush-cursor.ts`      | Changes the outline of a tool into what the view draws.                  |
| `src/lib/app/tools/picker-tool.ts`       | The color picker.                                                        |
| `src/lib/app/shared/registry.ts`         | A generic registry of items by id.                                       |

## Concepts

### A tool is data and functions

```ts
// src/lib/app/tools/tool.ts (shortened)
export interface Tool<S extends ToolSettings = ToolSettings> {
  readonly id: string;
  readonly title: string;
  readonly icon: Component;
  readonly defaults: S;
  readonly fields?: readonly ToolField[];
  readonly needsLayer?: boolean;
  readonly needsColor?: boolean;
  cursor(settings: S): BrushCursor;
  begin(context: ToolContext, settings: S, sample: Sample): ToolStroke | null;
  ...
}
```

- `defaults` are the settings of the tool. They are plain values (numbers, booleans, strings). Thus, the app can save them as JSON.
- `fields` tell the tool bar which controls to show: `size`, `integer`, `percent`, `toggle`, `choice`. The tool bar makes the controls from this list. A tool does not have its own Svelte component.
- `cursor` gives the outline under the pointer: a circle, the exact pixels of a pixel tip, a picker, or nothing.
- `begin` starts a stroke (see [Painter](../painter/)).

Optional parts: `preview` (the color swatch in the tool bar), `hover` (the CSS pointer, for example over a selection handle), `resize` (the `[` and `]` keys), `menu` (choices under the button, for example the tip shape), `brushSet`, `group`, `section`.

`defineTool<S>(tool)` checks the types of the settings when you define the tool. Then it stores the tool without the type of its settings. Thus, the registry can hold tools with different settings.

### Registry

`Registry<T>` (`shared/registry.ts`) is a `Map` by id that keeps the order of registration. `register` returns a function that removes the item. If two items have the same id, it throws an error. The tools and the modes use it.

## How it works

### Registration

`createToolRegistry()` registers all the tools of `BUILTIN_TOOLS`. Each tool then gets a command `tool.<id>` (see [Commands](../commands/)).

### Settings

`ToolRegistry.defaultOptions()` makes the default `ToolOptions`: dark gray and white as the colors, and a copy of `defaults` for each tool. The painter gives `options.tools[tool.id]` to `begin`.

### Size slider

The size of a painting tool goes from 0.5 to 1000 pixels. On a linear slider, all small sizes are in a very small part of the slider. Thus, the slider is _logarithmic_: the position (0 to 1) gives `MIN_SIZE × (MAX_SIZE / MIN_SIZE) ^ position`. Each step of the slider multiplies the size by the same factor.

```ts
export function sizeFromSlider(position: number): number {
  const size = MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, position);
  return size < 10 ? Math.round(size * 10) / 10 : Math.round(size);
}
```

`stepSize` (the `[` and `]` keys) multiplies the size by 1.25 or 0.8.

### Tool groups

Some tools share one button: the rectangle and the ellipse always, the painting brushes and the line only when the tool column is too tall for the window (`whenShort`). `toolEntries(tools, short)` makes the list of buttons. The button of a group shows the active tool, else the last used, else the first.

### Picker

The picker reads one pixel from a _source_ (the full canvas or the active layer). It takes the color, the opacity, or the two. `SOURCES` and `CHANNELS` are tables: add an entry and the tool bar shows it.

The pixels of the layers are _premultiplied_: the color is already multiplied by the alpha. Thus, the picker calls `unpremultiply` before it uses the color. A transparent pixel has no color: the picker then sets no current color.

`applyPicked` gives the color to the options, and the opacity to the last drawing tool (`drawingTool`), not to the picker. Alt turns any tool into the picker while it is held.

## Limits

- Tools only paint on the active layer.
- The settings of a tool must be plain values.
