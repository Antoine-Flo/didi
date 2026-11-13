---
title: Commands and shortcuts
description: How user actions are named commands, and how shortcuts, menus and the command palette run them.
sidebar:
  order: 9
---

## Purpose

Each user action is a named _command_, for example `history.undo` or `layer.add`. Buttons, shortcuts, menus and the command palette all run commands by their id. Thus, one action has one implementation, and the same rules apply wherever it comes from.

## Files

| File                                     | Purpose                                                           |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/core/editor/commands.ts`        | `Command` and `CommandRegistry`.                                  |
| `src/lib/app/commands/run-command.ts`    | Runs a command from the interface.                                |
| `src/lib/app/commands/app-commands.ts`   | Registers all the interface commands. Defines `AppHost`.          |
| `src/lib/app/commands/*-commands.ts`     | The commands of each domain: tool, view, color, edit, file, help. |
| `src/lib/app/state/command-host.ts`      | Makes the `AppHost` from `EditorState`.                           |
| `src/lib/app/commands/keymap.ts`         | Key chords, and the index that finds a binding.                   |
| `src/lib/app/commands/default-keymap.ts` | The built-in shortcuts.                                           |
| `src/lib/app/commands/keyboard.ts`       | `isTyping`, `keyInput`.                                           |
| `src/lib/app/commands/default-menus.ts`  | The menus of the title bar.                                       |
| `src/lib/app/commands/clipboard.ts`      | Copy and paste.                                                   |

## Concepts

### A command

```ts
// src/lib/core/editor/commands.ts (shortened)
export interface Command<Ctx, P = void> {
  readonly id: string; // e.g. "layer.add"
  readonly title: string;
  readonly needsParams?: boolean;
  enabled?(ctx: Ctx, params: P): boolean;
  checked?(ctx: Ctx): boolean;
  run(ctx: Ctx, params: P): void;
}
```

- The id has a namespace and a name, separated by a dot.
- `enabled` tells if the command can run now. Menus show disabled commands in gray.
- `checked` is for switches, for example "Show pixel grid".
- The params must be JSON values. Thus, a keymap file can store them.

### One registry

`EditorState` makes one `CommandRegistry`: `EditorState.commands`. Its constructor registers all the commands in it: the core commands and the interface commands.

The registry gets a function that gives the open `Editor`. It calls this function each time that a command runs. Thus, the same registry is correct for all documents.

### Hosts

The core commands (layers, history, selection) get the `Editor` as context. The interface commands also need the interface: the tools, the view, the dialogs. Each domain defines a small _host_ interface with only what it uses:

```ts
// src/lib/app/commands/app-commands.ts
export type AppHost = ToolHost & ViewHost & ColorHost & EditHost & FileHost & HelpHost;
```

`commandHost(state)` makes one object that has all these parts, from `EditorState`. The commands do not import `EditorState`. Thus, you can test a domain with a small fake host.

### Key chords

A _chord_ is a key with its modifiers, written as text: `"ctrl+shift+z"`, `"]"`, `"f2"`. `normalizeChord` puts the modifiers in a fixed order (ctrl, alt, shift) and in lowercase. Cmd on macOS counts as Ctrl.

The keymap matches keys by the character that they type (`KeyboardEvent.key`), not by their position on the keyboard (`code`). Thus, the shortcuts follow the layout of the user (AZERTY, QWERTZ…).

For symbols and digits, Shift and AltGr are part of how you type the character. On AZERTY, "0" needs Shift, and "[" needs AltGr. Thus, `chordOf` does not add `shift` for a symbol, and does not add `ctrl` or `alt` when AltGr is down (Windows reports Ctrl+Alt for AltGr).

## How it works

### Running a command

`runCommand(commands, editor, painter, id, params)`:

1. If the pen is down, it does nothing. Thus, a command does not change the document in the middle of a stroke.
2. If the command is disabled, it does nothing.
3. If the id starts with `layer.`, it applies the floating selection first. Floating content belongs to a layer.
4. It runs the command.

It returns `true` if the command ran.

### Shortcuts

`KeymapIndex` puts all bindings in a `Map` from chord to binding. A later binding for the same chord wins. `EditorState` makes the keymap from `DEFAULT_KEYMAP`, then the browser bindings. Thus, in a browser, Ctrl+S exports a PNG.

`isTyping(e)` is true when the key goes to a text field. Sliders, checkboxes and other inputs where you do not type text are not text fields: shortcuts still work after you use them.

`formatChord` shows a chord to the user: `"ctrl+shift+z"` becomes `"Ctrl+Shift+Z"`.

### Menus

The menus are data, like the keymap. Each item is a command id (with optional params and label), a submenu, or a separator. `availableMenus` removes the items whose command does not exist here (for example "Save" in a browser), and the separators that are then at an end or next to each other.

### Commands for tools

`registerToolCommands` makes one command for each tool (`tool.<id>`) in the tool registry. A new tool thus gets its command automatically. It also makes `selection.rectangle` and `selection.lasso`: they choose the `select` tool and set its shape. `brush.grow` and `brush.shrink` change the size of the active tool, if the tool has `resize`.

### Clipboard

`copy` writes the image to the system clipboard (straight RGBA). It also keeps an exact copy in memory (premultiplied, with its position). `toPaste` reads the system clipboard. If the system image has the same size as the copy in memory, it is most likely the same image. Then it pastes the exact copy at its original position. Else it pastes the system image in the middle of the canvas.

The conversion premultiplied → straight → premultiplied can change the colors of semi-transparent pixels a little. The copy in memory prevents this loss.

## Limits

- Commands with `needsParams` do not show in the command palette.
- The keymap cannot be changed by the user yet. It is plain data, so a file can replace it.
