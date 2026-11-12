---
title: Didi developer docs
description: How Didi works inside, module by module.
---

This documentation tells how Didi works inside: the architecture, the main algorithms, and the optimizations.

## Where to start

1. Read [Architecture](/doc/dev/start/architecture/): the parts of the app, the layers of the code, and the main objects.
2. Read [From pen to screen](/doc/dev/start/from-pen-to-screen/): the full path of one stroke through the code.
3. Then read the pages of the part that you want to change.

## The sections

| Section   | Code                                  | Contents                                                                    |
| --------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Core      | `src/lib/core/`                       | The document, the tiles, the history, the selection, the colors, the files. |
| Rendering | `src/lib/render/`                     | The canvas view on the GPU.                                                 |
| Painting  | `src/lib/mypaint/`, `native/mypaint/` | The brush engine.                                                           |
| Platform  | `src/lib/platform/`, `src-tauri/`     | The access to the system, in Tauri or in a browser.                         |
| App       | `src/lib/app/`                        | The tools, the input, the state of the editor, the interface.               |

## The parts of a page

Most pages have these parts:

1. **Purpose**: what the module does.
2. **Files**: the main files of the module.
3. **Concepts**: the ideas to know before you read the code.
4. **How it works**: the steps, in sequence.
5. **Optimizations**: what makes the code fast, and why.
6. **Limits**: what the module does not do.
