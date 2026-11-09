# Didi

[![CI](https://github.com/Antoine-Flo/didi/actions/workflows/ci.yml/badge.svg)](https://github.com/Antoine-Flo/didi/actions/workflows/ci.yml)

A drawing app for pixel art and painting, with lessons built in (coming soon) to help you learn to draw.

**[Try it in your browser](https://didipaint.com/app)** · [Website](https://didipaint.com) · [Documentation](https://didipaint.com/doc/) · [Devlog](https://didipaint.com/devlog/)

## AI disclosure

- Didi never sends your art anywhere: your drawings stay on your device. No AI will ever be trained on them through Didi, and no AI will ever be integrated into the tool or any future related tool. If anything, I plan to add some tools to help artists prove more easily that their work is legitimate, because sadly, this is where we are now.
- AI is used for coding. To me, generative AI for art and AI for programming are two different things. Of course, it comes with questions too, but different ones. If you're against the use of AI to create software, I totally respect that. I'm not, and this is where I decided to draw the line for this project.

## Features

- **Two modes**, Pixel art and Painting, each with its own tools and shortcuts. Every document remembers its mode.
- **196 MyPaint brushes** for painting, with pen pressure and tilt.
- **Pixel art tools**: pixel brush with pixel-perfect lines, pixel eraser, paint bucket, shapes, pixel and tile grids, and a zoom that keeps every pixel the same size.
- **Layers, selections and transforms**, copy and paste, canvas and image size.
- **A command palette** (Ctrl+K) to find any command, dark and light themes, a resizable interface, left- or right-handed layout.
- **Touch screens**: two-finger gestures, finger drawing, palm rejection, and a compact layout for small screens.
- **Open files**: a `.didi` file is a plain zip, with one standard PNG per layer.

Coming next: animation, then drawing lessons for both painting and pixel art.

## Platforms

| Platform | Status                                                         |
| -------- | -------------------------------------------------------------- |
| Browser  | Available at [didipaint.com/app](https://didipaint.com/app).   |
| Linux    | Builds from source, with native pen input (pressure and tilt). |
| Windows  | Builds from source.                                            |
| macOS    | Planned.                                                       |

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

To run only the browser version: `npx vite dev --port 1430`. Port 1420 is kept for `tauri dev`.

To build a standalone executable: `npm run tauri build -- --no-bundle`.

## Development

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run tauri dev` | Runs the desktop app (and rebuilds the Rust side).        |
| `npm test`          | Runs the tests (Vitest).                                  |
| `npm run lint`      | Checks formatting (Prettier, rustfmt) and lints (ESLint). |
| `npm run check`     | Checks types (TypeScript, Svelte).                        |
| `npm run format`    | Formats all the code.                                     |

The compiled libmypaint (`src/lib/mypaint/libmypaint.mjs`) is committed, so you don't need Emscripten unless you change it. To rebuild it: `source ~/emsdk/emsdk_env.sh`, then `native/mypaint/build.sh`.

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

AI-assisted code is fine, as long as you understand and stand behind what you send. Art is different: please don't contribute AI-generated images, brushes or lesson content (see [AI disclosure](#ai-disclosure)).

## Acknowledgements

Didi stands on the shoulders of great open-source projects:

- [libmypaint](https://github.com/mypaint/libmypaint) (ISC license), the brush engine. Notice: `native/mypaint/LICENSE-libmypaint`.
- [MyPaint brushes](https://github.com/mypaint/mypaint-brushes) (CC0). Notice: `src/lib/mypaint/brushes/LICENSE-mypaint-brushes`.
- [Tauri](https://tauri.app), [Svelte](https://svelte.dev), [PixiJS](https://pixijs.com), [Bits UI](https://bits-ui.com) and [fflate](https://github.com/101arrowz/fflate).

## License

Didi is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License](LICENSE), version 3 or (at your option) any later version.

In short, you can use, study, share and change Didi, and even sell it, as long as what you share stays under the same license, with its source code.

The name "Didi" and its logo are not covered by the license. If you publish a modified version, please give it another name, so that nobody mixes them up.

Third-party code and brushes keep their own licenses: see [Acknowledgements](#acknowledgements).
