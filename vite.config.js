/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
// Tauri has no Node.js server for SSR: adapter-static with a fallback to index.html puts
// the app in SPA mode. See https://v2.tauri.app/start/frontend/sveltekit/
import adapter from "@sveltejs/adapter-static";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// Interface texts: messages/en.json, compiled into typed functions (see doc/DECISIONS.md).
const paraglide = () =>
  paraglideVitePlugin({
    project: "./project.inlang",
    outdir: "./src/lib/paraglide",
    emitTsDeclarations: true,
    strategy: ["localStorage", "preferredLanguage", "baseLocale"],
  });

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ fallback: "index.html" }),
    }),
    paraglide(),
  ],
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
