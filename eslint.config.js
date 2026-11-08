import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { loadConfig } from "@sveltejs/load-config";

const svelteConfig = (await loadConfig("./", { traverse: false }))?.config;

export default ts.config(
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "src-tauri/",
      "node_modules/",
      "src/lib/mypaint/libmypaint.mjs",
      "src/lib/paraglide/",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      // __APP_VERSION__: defined at build time (see vite.config.js and src/globals.d.ts).
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: "readonly" },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    // Tauri only through src/lib/platform: the interface asks it what it can do.
    files: ["src/**"],
    ignores: ["src/lib/platform/**", "src/routes/lab/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/*"],
              message: "Use src/lib/platform (capabilities, storage, window, pen) instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // The core must stay independent from UI, rendering and platform.
    files: ["src/lib/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "pixi.js",
                "svelte",
                "svelte/*",
                "@tauri-apps/*",
                "$app/*",
                // Escaped: a leading # starts a comment in these patterns.
                "\\#lib/*",
                // Its texts are messages, like everywhere else.
                "!\\#lib/paraglide",
                "\\#lib/paraglide/*",
                "!\\#lib/paraglide/messages.js",
              ],
              message: "src/lib/core must not depend on UI, rendering or platform code.",
            },
          ],
        },
      ],
    },
  },
);
