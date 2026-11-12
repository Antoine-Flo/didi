/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
// No server, neither in Tauri nor on the website: adapter-static writes every page as a
// file (see src/routes/+layout.ts). See https://v2.tauri.app/start/frontend/sveltekit/
import adapter from "@sveltejs/adapter-static";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import process from "node:process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

/** The app's version, shown in About (package.json, kept equal to tauri.conf.json's). */
const version = JSON.parse(readFileSync("./package.json", "utf8")).version;

const host = process.env.TAURI_DEV_HOST;

// Interface texts: messages/en.json, compiled into typed functions (see doc/DECISIONS.md).
const paraglide = () =>
  paraglideVitePlugin({
    project: "./project.inlang",
    outdir: "./src/lib/paraglide",
    emitTsDeclarations: true,
    strategy: ["localStorage", "preferredLanguage", "baseLocale"],
  });

/** The website's paths (website/): its pages, and the files they load. */
const WEBSITE_PATH = /^\/(doc|_astro|pagefind)(\/|$)/;
/** @type {Record<string, string>} */
const WEBSITE_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

/**
 * In dev, the website's last build (website/dist, see `npm run build:site`) at its paths, so
 * that the landing page's links work as online, where `npm run deploy` puts it next to the app.
 */
/** @returns {import("vite").Plugin} */
const websitePages = () => ({
  name: "didi-website-pages",
  configureServer(server) {
    const root = join(process.cwd(), "website/dist");
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? "").split("?")[0]);
      if (!WEBSITE_PATH.test(path)) {
        return next();
      }
      let file = join(root, normalize(path));
      if (!file.startsWith(root)) {
        return next();
      }
      if (existsSync(file) && statSync(file).isDirectory()) {
        file = join(file, "index.html");
      }
      if (!existsSync(file)) {
        return next();
      }
      res.setHeader("Content-Type", WEBSITE_TYPES[extname(file)] ?? "application/octet-stream");
      res.end(readFileSync(file));
    });
  },
});

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      prerender: {
        // /doc is the website (website/), added to build/ at deploy time: the
        // landing page links to it, but it is not a page of the app.
        handleHttpError: ({ path, message }) => {
          if (/^\/doc(\/|$)/.test(path)) {
            return;
          }
          throw new Error(message);
        },
      },
    }),
    paraglide(),
    websitePages(),
  ],
  // In tests, Svelte's browser build: the server one never runs `$effect`, which the editor's
  // state classes rely on (see the *.svelte.test.ts files).
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  define: { __APP_VERSION__: JSON.stringify(version) },
  // The file worker shows messages too (errors in a damaged file).
  worker: { plugins: () => [paraglide()] },
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // A test that runs this long is stuck: fail instead of hanging.
    testTimeout: 30000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    // 3. nothing in the webview's cache: WebKitGTK serves old modules from its cache
    //    without asking the server, e.g. files at their old path after a move.
    headers: { "Cache-Control": "no-store" },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 4. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
