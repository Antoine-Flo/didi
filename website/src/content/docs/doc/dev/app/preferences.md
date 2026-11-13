---
title: Preferences and theme
description: The layout preferences, the theme and its CSS variables, and the saved colors.
sidebar:
  order: 22
---

## Purpose

The preferences keep the user's choices from one session to the next. There are three groups, in three files of the app data folder:

| Group  | File          | Class         | Content                                                                                     |
| ------ | ------------- | ------------- | ------------------------------------------------------------------------------------------- |
| Layout | `layout.json` | `LayoutPrefs` | Hand, columns, interface size, compact layout, finger drawing, panel sizes, color selector. |
| Theme  | `theme.json`  | `ThemePrefs`  | Dark or light, tint, canvas background.                                                     |
| Colors | `colors.json` | `SavedColors` | Current color and second color.                                                             |

## Files

| File                                       | Purpose                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `src/lib/app/prefs/layout-prefs.ts`        | The layout types and `parseLayoutPrefs`. No runes.                          |
| `src/lib/app/prefs/layout-prefs.svelte.ts` | `LayoutPrefs`: the reactive layout preferences.                             |
| `src/lib/app/prefs/theme.ts`               | The tokens, the dark and light themes, `buildTheme`, `applyTheme`.          |
| `src/lib/app/prefs/theme-prefs.svelte.ts`  | `ThemePrefs`, and `themePrefs`, the one instance for the app.               |
| `src/lib/app/prefs/saved-colors.svelte.ts` | `SavedColors`: saves the current and second colors, and `parseSavedColors`. |
| `src/lib/app/shared/data-file.ts`          | `DataFile`: saves a JSON file after a short delay.                          |

## Concepts

### Runes and `.svelte.ts` files

Svelte 5 uses **runes** for reactivity: `$state`, `$derived`, `$effect`. A rune is a special function that the Svelte compiler changes. A value made with `$state` tells Svelte when it changes. A `$derived` value is calculated again when a value that it reads changes. An `$effect` runs again in the same conditions.

Runes work in `.svelte` components and in files that end with `.svelte.ts`. Thus, the classes with reactive state are in `.svelte.ts` files. The pure parts (types, parsers) are in plain `.ts` files. Pure code is easier to test, and other code can use it without the Svelte compiler. This is why `layout-prefs.ts` and `layout-prefs.svelte.ts` are two files.

### Parse, do not trust

A preferences file can be old, from another version, or edited by hand. Each parser (`parseLayoutPrefs`, `parseThemeChoice`, `parseSavedColors`) reads the JSON and keeps only the values that are valid. It ignores the others. For the layout and the theme, the result is `Partial<…>`: the missing values keep their defaults.

```ts
// src/lib/app/prefs/layout-prefs.ts
if ("uiScale" in data) {
  const s = data.uiScale;
  if (typeof s === "number" && s >= UI_SCALE_MIN && s <= UI_SCALE_MAX && s % UI_SCALE_STEP === 0) {
    prefs.uiScale = s;
  }
}
```

Preferences are not precious. A file that cannot be read does not stop the app: the defaults apply.

### Changes before the load

The app starts before the file is read. The user can change a preference during this time. `LayoutPrefs` keeps a list of the fields changed before the load (`changed`). `load()` does not replace these fields with the saved values. Thus, a change is never lost.

`DataFile` does not save before the load. Otherwise, the default values replace the user's file.

## How it works

### Layout preferences

`LayoutPrefs` keeps all the values in one `$state` object (`data`). Getters and setters give access to each value. Each setter calls `setField`, which:

1. Changes the value.
2. Notes the field as changed (if the load is not done).
3. Asks the `DataFile` to save after 300 ms.

`sizes` is by key: the size of each resizable panel, by panel id, in pixels at 100 % interface size. Thus, a size stays correct when the user changes the interface size.

`colorSelector` is the selector of the color panel: `"square"` (the default) or `"wheel"`.

`fingerDraws` is calculated: with `"auto"`, one finger draws until a pen is used on this device (`penSeen`). Then one finger only moves the view.

### The theme

The theme is a set of **tokens**: named values for colors, sizes and fonts (`TOKENS` in `theme.ts`). `applyTheme` sets each token as a CSS variable on the root element:

```ts
// src/lib/app/prefs/theme.ts
for (const token of TOKENS) {
  root.style.setProperty(`--${token}`, theme.tokens[token]);
}
```

Components use only these variables, for example `var(--panel)` or `var(--space)`. They never use a raw color. Thus, one change in the theme changes all the interface.

The sizes include `var(--ui-scale)`:

```ts
const scaled = (px: number) => `calc(${px}px * var(--ui-scale))`;
```

`--ui-scale` is the interface size chosen by the user, as a factor. A change of `--ui-scale` changes all the sizes at the same time, without new JavaScript calculations.

### The tint

`buildTheme(choice)` starts from `DARK_THEME` or `LIGHT_THEME`. If `tint` is on, `tintGray` gives each gray a small blue hue.

`tintGray` works in **OKLCH**, a color space where the lightness is near to what the eye sees. It:

1. Converts the gray to OKLab and keeps its lightness `L`.
2. Makes a new color with the same `L`, the hue 250° and a small chroma (0.01).
3. Converts it back to sRGB.

Thus, the tinted gray has the same lightness as the neutral gray. The text and the contrast do not change. The canvas background gets only half of the tint: a colored background changes how the user sees the colors of the drawing.

### When the theme applies

The `(app)` layout (`src/routes/(app)/+layout.svelte`) applies the default theme **before** any page shows, then the saved theme when it is loaded, and again at each change:

```svelte
applyTheme(themePrefs.theme); void themePrefs.load(); $effect(() => applyTheme(themePrefs.theme));
```

The canvas reads its background from the theme at start. Thus, the theme must be there first.

### Saved colors

`SavedColors` keeps the current color and the second color of the tool options (`options.color`, `options.secondary`) in `colors.json`:

```json
{ "version": 2, "color": "#141414", "secondary": "#ffffff" }
```

Each color is a hex code, or `null` for no color.

- At start, `load()` reads the file. If the file has two valid colors, it puts them into the tool options. Else the default colors stay.
- An effect reads the two colors. When one changes after the load, it asks the `DataFile` to save after 300 ms.
- Before the app closes, `flush()` saves now.

## Limits

- The preferences are for one device. They are not in the `.didi` file.
- The theme has two bases only: dark and light.
