---
title: Interface texts
description: How the texts of the interface come from messages/en.json through Paraglide.
sidebar:
  order: 26
---

## Purpose

All the texts that the user sees come from one file: `messages/en.json`. No component and no module writes a text for the user directly in the code. The code calls a **message function** instead.

This gives two results:

- All the texts are in one place. A translation adds one file, without changes to the code.
- TypeScript checks each message and its parameters. A missing message or a wrong parameter is an error at build time.

## Files

| File                           | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `messages/en.json`             | The English texts, by key.                                              |
| `project.inlang/settings.json` | The locales (`en`), the base locale, and the path of the message files. |
| `vite.config.js`               | `paraglideVitePlugin`: compiles the messages during dev and build.      |
| `src/lib/paraglide/`           | The compiled output. It is generated: do not edit it. Git ignores it.   |

## Concepts

### A compiler, not a runtime library

Many i18n libraries load a JSON file at runtime and find a text by its key: `t("files.saving")`. A wrong key is only found when the code runs.

[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) is a **compiler**. It reads `messages/en.json` and writes one JavaScript function for each message, with TypeScript types. The code imports these functions:

```ts
import { m } from "#lib/paraglide/messages.js";

this.host.notify(m.files_open_failed({ name, error }));
```

A wrong name or a missing parameter is a type error. The bundler removes the messages that no code uses (tree shaking).

### A message with parameters

A message can have parameters in braces:

```json
"files_saving": "Saving {name}…",
"layer_default_copy": "{name} copy",
```

The compiled function takes an object with these parameters: `m.files_saving({ name: "drawing.didi" })`.

### When the compilation runs

- `npm run dev` and `npm run build`: the Vite plugin compiles the messages, and compiles them again when `en.json` changes.
- `npm run check` and `npm run messages`: compile the messages before the type check.
- The file worker (`file-worker.ts`) also shows messages (for example, errors in a damaged file). Thus, `vite.config.js` adds the plugin to the worker build too (`worker: { plugins: () => [paraglide()] }`).

If a new message has no function, the output is old. Run `npm run messages`, or start the dev server again.

## How it works

### Keys

The keys have a prefix for their part of the app. Some examples:

| Prefix        | Part                                             |
| ------------- | ------------------------------------------------ |
| `common_`     | Words used in many places: Cancel, Close, Apply. |
| `cmd_`        | Titles of commands (menus, command palette).     |
| `files_`      | File actions and their errors.                   |
| `file_error_` | Errors when a `.didi` file is damaged.           |
| `start_`      | The start screen, for example `start_sizes_*`.   |
| `tool_`       | Names of the tools.                              |

### The locale

The strategy in `vite.config.js` is `["localStorage", "preferredLanguage", "baseLocale"]`. Paraglide tries each one in sequence: a locale saved in `localStorage`, then the language of the browser, then the base locale (`en`). Only `en` exists now, thus the result is always `en`.

The `(app)` layout sets `document.documentElement.lang = getLocale()`. The browser uses it for spelling, hyphenation and screen readers.

### In the core

The core (`src/lib/core/`) cannot import the interface. But its errors are for the user too (for example, "The file is damaged"). Thus, the ESLint rules let all the layers import `#lib/paraglide/messages.js`, and nothing else from `#lib/paraglide/` (see [Tests and code rules](/doc/dev/app/tests/)).

## Limits

- Messages are evaluated when the code calls them. A message in a constant at module level (for example, the group names of `SIZE_PRESETS` in `new-document-choice.svelte.ts`) is evaluated once, at load. A change of locale while the app runs does not change it.
