# Didi

[![CI](https://github.com/Antoine-Flo/didi/actions/workflows/ci.yml/badge.svg)](https://github.com/Antoine-Flo/didi/actions/workflows/ci.yml)

A drawing app for pixel art and painting, with lessons built in (coming soon) to help you learn to draw.

**[Try it in your browser](https://didipaint.com/app)** · [Website](https://didipaint.com) · [Documentation](https://didipaint.com/doc/) · [Devlog](https://didipaint.com/devlog/)

## Features

- **Painting**: 196 MyPaint brushes, with pen pressure and tilt.
- **Pixel art**: pixel-perfect lines, pixel and tile grids.
- **Editing**: layers, selections, transforms, palettes.
- **Any device**: pen, mouse or touch, from phone to desktop.
- **Open files**: a `.didi` file is a plain zip, with one PNG per layer.

Coming next: animation, then drawing lessons for both painting and pixel art.

## Platforms

| Platform | Status                                                       |
| -------- | ------------------------------------------------------------ |
| Browser  | Available at [didipaint.com/app](https://didipaint.com/app). |
| Linux    | Planned.                                                     |
| Windows  | Planned.                                                     |
| macOS    | Planned.                                                     |

The web version is free. Ready-made downloads will be sold, and you can always build Didi from source.

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
npm install
npm run tauri dev
```

Browser only: `npm run dev`.

To build a standalone executable: `npm run tauri build -- --no-bundle`.

## Development

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run tauri dev` | Runs the desktop app (and rebuilds the Rust side).        |
| `npm test`          | Runs the tests (Vitest).                                  |
| `npm run lint`      | Checks formatting (Prettier, rustfmt) and lints (ESLint). |
| `npm run check`     | Checks types (TypeScript, Svelte).                        |
| `npm run format`    | Formats all the code.                                     |

To check formatting before each commit: `git config core.hooksPath .githooks`.

The compiled libmypaint (`src/lib/mypaint/wasm/libmypaint.mjs`) is committed, so you don't need Emscripten unless you change it. To rebuild it, with [Emscripten](https://emscripten.org) set up: `native/mypaint/build.sh`.

### Documentation and devlog

```sh
cd website
npm install
npm run dev
```

The pages are Markdown files in `website/src/content/docs/`: `doc/` for the documentation, `devlog/` for the devlog posts.

## Contributing

Bug reports, ideas and feedback are all welcome: please open an [issue](https://github.com/Antoine-Flo/didi/issues). If you'd like to work on something bigger, opening an issue first is the best way to talk it through.

Before sending a pull request, please make sure `npm run lint`, `npm run check` and `npm test` pass.

Please sign off your commits (`git commit -s`). This adds a `Signed-off-by` line, which says that you wrote the change, or have the right to send it, under the project's license (the [Developer Certificate of Origin](https://developercertificate.org)).

AI-assisted code is fine, as long as you understand and stand behind what you send. Art is different: please don't contribute AI-generated images, brushes or lesson content.

## Acknowledgements

Thanks to these amazing projects that make Didi possible:

- [libmypaint](https://github.com/mypaint/libmypaint) (ISC license), the brush engine. Notice: `native/mypaint/LICENSE-libmypaint`.
- [MyPaint brushes](https://github.com/mypaint/mypaint-brushes) (CC0). Notice: `src/lib/mypaint/brushes/LICENSE-mypaint-brushes`.
- [Tauri](https://tauri.app), [Svelte](https://svelte.dev), [PixiJS](https://pixijs.com), [Bits UI](https://bits-ui.com) and [fflate](https://github.com/101arrowz/fflate).

## License

Didi is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License](LICENSE), version 3 or (at your option) any later version.

In short, you can use, study, share and change Didi, and even sell it, as long as what you share stays under the same license, with its source code.

The name "Didi" and its logo are not covered by the license. If you publish a modified version, please give it another name, so that nobody mixes them up.

Third-party code and brushes keep their own licenses: see [Acknowledgements](#acknowledgements).
