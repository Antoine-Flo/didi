---
title: Pages and build
description: The SvelteKit routes, the static adapter, and why the app has no server.
sidebar:
  order: 27
---

## Purpose

`src/routes/` contains the pages of Didi. The same build gives the pages of the desktop app and of the website. There is no server: all the pages are static files.

## Files

| File                                    | URL         | Purpose                                                    |
| --------------------------------------- | ----------- | ---------------------------------------------------------- |
| `src/routes/+layout.ts`                 | all         | `prerender = true`: each page is a file at build time.     |
| `src/routes/+page.svelte`               | `/`         | The landing page of the website.                           |
| `src/routes/(app)/+layout.ts`           | (app) pages | `ssr = false`: these pages render in the browser only.     |
| `src/routes/(app)/+layout.svelte`       | (app) pages | Applies the theme, shows the title bar.                    |
| `src/routes/(app)/app/+page.svelte`     | `/app`      | The editor: `<EditorApp />`.                               |
| `src/routes/(app)/preview/+page.svelte` | `/preview`  | The preview window (see [Preview](/doc/dev/app/preview/)). |
| `src/routes/(app)/lab/…`                | `/lab/…`    | Test pages (see [Lab pages](/doc/dev/app/lab/)).           |
| `vite.config.js`                        |             | SvelteKit, the static adapter, Paraglide, Vitest.          |

## Concepts

### SvelteKit routes

[SvelteKit](https://svelte.dev/docs/kit) makes one page for each folder of `src/routes/` that has a `+page.svelte` file. The path of the folder is the URL: `src/routes/(app)/app/+page.svelte` is the page `/app`.

A `+layout.svelte` file wraps all the pages in its folder and below. It renders them where it calls `{@render children()}`. A `+layout.ts` file sets options for these pages.

### Route groups

A folder name in parentheses, like `(app)`, is a **group**. It is not a part of the URL. It only collects pages that share a layout. Thus, `/app`, `/preview` and `/lab` share the layout of `(app)`, and `/` does not.

### The static adapter

SvelteKit can run a Node.js server. Didi does not use one:

- The desktop app (Tauri) loads its pages from files. It has no Node.js.
- The website serves static files only.

Thus, `vite.config.js` uses `@sveltejs/adapter-static`. It writes each page as an HTML file in `build/`.

### Prerender and SSR

- **Prerender** (`prerender = true`): SvelteKit makes the HTML of a page at build time.
- **SSR** (server-side rendering): the HTML contains the rendered content of the page.

The landing page `/` uses both. Its HTML has all its content. It shows without JavaScript, and search engines can read it.

The app pages use `ssr = false`. The app needs the DOM from the start (canvas, WebGL, `localStorage`, `navigator`). Thus, the build writes an empty HTML page that loads the JavaScript, and the app renders in the browser.

## How it works

### The `(app)` layout

```svelte
<!-- src/routes/(app)/+layout.svelte -->
applyTheme(themePrefs.theme); void themePrefs.load(); $effect(() => applyTheme(themePrefs.theme)); document.documentElement.lang
= getLocale();
```

Then it shows the `Titlebar` above the page, unless the page sets `windowTitle.hidden` (the preview window has its own bar).

### The landing page

The landing page uses the same theme tokens as the app (`buildTheme`, `TOKENS`). It writes them as CSS in the `<head>`, with a small script. The script reads the theme that the user selected, before the page shows. Thus, the page does not show the wrong theme for a moment.

The link to `/app` has `data-sveltekit-reload`. The browser loads the editor as a new page. Without it, SvelteKit loads the editor in the same page, and the global styles of the editor (`ui.css`) change the landing page.

### Imports with `#lib`

The code imports its modules with `#lib/…`:

```ts
import { EditorState } from "#lib/app/state/editor-state.svelte.js";
```

`#lib` is a [subpath import](https://nodejs.org/api/packages.html#subpath-imports) in `package.json`:

```json
"imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" }
```

Node.js, Vite, Vitest and TypeScript all know this format. A test checks that no file uses a relative import (`../`). Thus, a file can move without changes to the files that it imports.

### Build-time values

`vite.config.js` reads the version from `package.json` and defines `__APP_VERSION__`. The About dialog shows it.

## Limits

- No page can use server features: no `+page.server.ts`, no form actions, no API routes.
- `/doc` is a link from the landing page to the documentation website, which is a separate project. The prerender ignores errors for this path.
