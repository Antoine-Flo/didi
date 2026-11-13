---
title: Tests and code rules
description: Vitest, property-based tests, tests of reactive classes, and the rules that keep the layers apart.
sidebar:
  order: 29
---

## Purpose

The tests check that the code works. The code rules check that the code stays in order: each layer uses only the layers below it, and each file is in the correct folder.

## Files

| File                        | Purpose                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `vite.config.js` (`test`)   | The Vitest settings.                                             |
| `src/**/*.test.ts`          | The tests, beside the file that they test.                       |
| `src/lib/core/testing/`     | Helpers for the core tests (`test-utils.ts`, `png-fixtures.ts`). |
| `src/lib/structure.test.ts` | Checks the layout of the files.                                  |
| `eslint.config.js`          | The lint rules, with the import rules of each layer.             |

## Commands

| Command              | Effect                                               |
| -------------------- | ---------------------------------------------------- |
| `npm test`           | Runs all the tests one time.                         |
| `npm run test:watch` | Runs the tests again when a file changes.            |
| `npm run lint`       | Prettier, ESLint, and `cargo fmt` for the Rust code. |
| `npm run check`      | Type check of TypeScript and Svelte.                 |

## Concepts

### Vitest

[Vitest](https://vitest.dev) runs the tests. It uses the same configuration as Vite: the `#lib` imports, the Svelte compiler and the Paraglide messages work in the tests as in the app.

```js
// vite.config.js
test: {
  include: ["src/**/*.test.ts"],
  testTimeout: 30000,
},
```

A test that runs longer than 30 seconds fails. A stuck test does not stop the test run.

### Property-based tests

An example-based test checks one input: "this 2 × 2 image gives these bytes". A **property-based test** checks a rule for many random inputs: "for each image, decode(encode(image)) is equal to the image".

[fast-check](https://fast-check.dev) makes the random inputs. If a test fails, fast-check makes the input smaller and smaller until it finds a small input that still fails (shrinking). Thus, the error message shows a simple case.

```ts
// src/lib/core/file/png.test.ts
fc.assert(
  fc.property(
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer(),
    (width, height, seed) => {
      const img = image(width, height, (i) => /* pixels from the seed */);
      const back = decodePng(encodePng(img));
      expect(back.data).toEqual(img.data);
    },
  ),
  { numRuns: 200 },
);
```

`numRuns` sets the number of random inputs. Keep it small and keep the inputs small (here, a maximum of 12 × 12 pixels). A property test with large inputs can run for minutes.

The core uses property tests for the parts with many cases: tiles, pixels, PNG, the `.didi` format, edits and history, rasterization, palettes.

### Tests of reactive classes

The classes in `.svelte.ts` files use runes. Two settings are necessary to test them:

- `resolve: { conditions: ["browser"] }` in `vite.config.js` when Vitest runs. The server build of Svelte never runs `$effect`. The browser build does.
- `// @vitest-environment happy-dom` at the top of the test file. [happy-dom](https://github.com/capricorn86/happy-dom) gives a simulated DOM (`document`, `window`, `localStorage`) in Node.js.

These tests replace the platform with a mock, and the timers with fake timers:

```ts
// src/lib/app/prefs/theme-prefs.svelte.test.ts
const files = new Map<string, string>();
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async (name: string) => files.get(name) ?? null,
  writeDataFile: async (name: string, text: string) => void files.set(name, text),
}));

vi.useFakeTimers();
// …
await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
```

With fake timers, the test moves the time forward. It does not wait 300 ms for a real save.

## How it works

### The layers

The code in `src/lib/` has layers. The arrows show which layer can import which:

```
core  ←  render, platform  ←  app
```

- `core` imports no other layer, no Svelte, no PixiJS, no Tauri.
- `render` and `platform` import only `core` and themselves.
- `app` imports all of them.
- Only `platform` can import `@tauri-apps/*`. The lab pages are the exception.

All the layers can import `#lib/paraglide/messages.js`, for the texts.

`eslint.config.js` makes these rules with `no-restricted-imports`. The `layer(name, allowed)` function makes one rule for each layer:

```js
layer("render", ["core", "render"]),
layer("platform", ["core", "platform"], { tauri: true }),
```

One function makes the rules because ESLint does not add two `no-restricted-imports` rules on the same files. The second one replaces the first one. Thus, each layer must have all its patterns in one rule.

Other rules:

- In `app/`, outside `ui/` folders, code cannot import a component. Logic does not depend on the interface.
- Only tests can import `#lib/core/testing/`.
- `@typescript-eslint/no-floating-promises`: a promise must be awaited, caught, or marked with `void`. Otherwise, its error is lost without a message.
- `curly: "all"`: braces on each `if`, `else`, `for` and `while`, also for one line.

### The structure test

`src/lib/structure.test.ts` reads all the files of `src/` and checks four rules:

1. **One type of file in each folder of `src/lib`.** For example, `.ts` files and `.svelte` files are not in the same folder. A test file and a `.svelte.ts` file count as TypeScript.
2. **Components only in `ui/` folders, and no TypeScript in them.**
3. **A maximum of 400 lines in each source file.** Tests are not included.
4. **Imports through `#lib`, never by a relative path** (`./` or `../`).

The generated folder `lib/paraglide` is not checked.

## Limits

- The tests do not check the rendering on a real GPU, and do not compare images.
- happy-dom is not a real browser. It has no WebGL and no real layout: sizes of elements are 0. Tests that need sizes set them by hand.
