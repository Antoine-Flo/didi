# Didi

[![CI](https://github.com/Antoine-Flo/didi/actions/workflows/ci.yml/badge.svg)](https://github.com/Antoine-Flo/didi/actions/workflows/ci.yml)

A modern pixel art editor: free, and everywhere.

**[Try it in your browser](https://didipaint.com/app)** · [Website](https://didipaint.com) · [Documentation](https://didipaint.com/doc/)

## Features

- **Pixel art**: pixel-perfect lines, shapes, fill, pixel and tile grids.
- **Editing**: layers, selections, transforms, palettes.
- **Any device**: pen, mouse or touch, from phone to desktop.
- **Open files**: a `.didi` file is a plain zip, with one PNG per layer.

Coming next: animation.

## Platforms

| Platform | Status                                                       |
| -------- | ------------------------------------------------------------ |
| Browser  | Available at [didipaint.com/app](https://didipaint.com/app). |
| Linux    | Planned.                                                     |
| Windows  | Planned.                                                     |
| macOS    | Planned.                                                     |

Didi is free everywhere: in the browser, as a download and in the stores. You can also build it from source.

## Building from source

Didi is a [Tauri 2](https://v2.tauri.app) app with a [SvelteKit](https://svelte.dev/docs/kit) frontend.

### Prerequisites

- [Node.js](https://nodejs.org) 26 and [Rust](https://www.rust-lang.org/tools/install) (stable).
- **Linux**: the WebKitGTK 4.1 development packages. On Debian or Ubuntu:

  ```sh
  sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

  For other distributions, see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

- **Windows**: Rust with the MSVC toolchain, and the Build Tools for Visual Studio (Desktop development with C++).

### Run it

```sh
npm run setup         # once: installs the app and the website
npm run dev
```

This opens the desktop app. For the browser version, open the link that the terminal shows (http://localhost:1420).

To build a standalone executable: `npm run tauri build -- --no-bundle`.

## Development

| Command            | What it does                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `npm run dev`      | Runs the desktop app (and rebuilds the Rust side). For the browser version, open the link in the terminal. |
| `npm run dev:site` | To write the docs.                                                                                         |
| `npm test`         | Runs the tests (Vitest).                                                                                   |
| `npm run lint`     | Checks formatting (Prettier, rustfmt) and lints (ESLint).                                                  |
| `npm run check`    | Checks types (TypeScript, Svelte).                                                                         |
| `npm run format`   | Formats all the code.                                                                                      |

To check formatting before each commit: `git config core.hooksPath .githooks`.

### Website and docs

The pages are Markdown files in `website/src/content/docs/`:

- `doc/`: the user guide.
- `doc/dev/`: the developer docs, how Didi works inside (architecture, algorithms, optimizations). Also online at [didipaint.com/doc/dev](https://didipaint.com/doc/dev/).

## Contributing

Bug reports, ideas and feedback are all welcome: please open an [issue](https://github.com/Antoine-Flo/didi/issues). If you'd like to work on something bigger, opening an issue first is the best way to talk it through. To find your way in the code, start with the [developer docs](https://didipaint.com/doc/dev/).

Before sending a pull request, please make sure `npm run lint`, `npm run check` and `npm test` pass.

Please sign off your commits (`git commit -s`). This adds a `Signed-off-by` line, which says that you wrote the change, or have the right to send it, under the project's license (the [Developer Certificate of Origin](https://developercertificate.org)).

AI-assisted code is fine, as long as you understand and stand behind what you send. Art is different: please don't contribute AI-generated images or palettes.

## Acknowledgements

Thanks to these amazing projects that make Didi possible:

- [Tauri](https://tauri.app), [Svelte](https://svelte.dev), [PixiJS](https://pixijs.com), [Bits UI](https://bits-ui.com) and [fflate](https://github.com/101arrowz/fflate).

## License

Didi is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License](LICENSE), version 3 or (at your option) any later version.

In short, you can use, study, share and change Didi, and even sell it, as long as what you share stays under the same license, with its source code.

The name "Didi" and its logo are not covered by the license. If you publish a modified version, please give it another name, so that nobody mixes them up.

Third-party code keeps its own license: see [Acknowledgements](#acknowledgements).
