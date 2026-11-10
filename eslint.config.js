import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { loadConfig } from "@sveltejs/load-config";

const svelteConfig = (await loadConfig("./", { traverse: false }))?.config;

// Escaped in these patterns: a leading # starts a comment.
const TAURI = {
  group: ["@tauri-apps/*"],
  message: "Use src/lib/platform (capabilities, storage, window, pen) instead.",
};
/** Only for tests (see src/lib/core/testing). */
const TESTING = {
  group: ["\\#lib/core/testing/*"],
  message: "Test helpers are for tests only.",
};

/**
 * The folders of src/lib a layer may import, besides packages: one rule per layer, as a
 * second "no-restricted-imports" on the same files replaces the first instead of adding to it.
 * Dependencies go one way: core, then render, mypaint and platform, then app; lab only for
 * the lab pages. Tauri stays in platform.
 */
function layer(name, allowed, { tauri = false } = {}) {
  return {
    files: [`src/lib/${name}/**`],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...(tauri ? [] : [TAURI]),
            TESTING,
            {
              group: [
                "\\#lib/*",
                ...allowed.map((folder) => `!\\#lib/${folder}`),
                // Its texts are messages, like everywhere else.
                "!\\#lib/paraglide",
                "\\#lib/paraglide/*",
                "!\\#lib/paraglide/messages.js",
              ],
              message: `src/lib/${name} may only use ${allowed.join(", ")}.`,
            },
          ],
        },
      ],
    },
  };
}

export default ts.config(
  {
    ignores: [
      "build/",
      // The website has its own project and checks (website/package.json).
      "website/",
      ".svelte-kit/",
      "src-tauri/",
      "node_modules/",
      "src/lib/mypaint/wasm/libmypaint.mjs",
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
    // Braces on every if/else/for/while body, even one line. After `prettier`, which turns it off.
    rules: { curly: ["error", "all"] },
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
    ignores: ["src/lib/platform/**", "src/routes/(app)/lab/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [TAURI] }],
    },
  },
  {
    // The core must stay independent from UI, rendering and platform.
    files: ["src/lib/core/**"],
    ignores: ["**/*.test.ts", "src/lib/core/testing/**"],
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
                "\\#lib/*",
                // Itself, like everywhere else: "#lib/core/…".
                "!\\#lib/core",
                // Its texts are messages, like everywhere else.
                "!\\#lib/paraglide",
                "\\#lib/paraglide/*",
                "!\\#lib/paraglide/messages.js",
              ],
              message: "src/lib/core must not depend on UI, rendering or platform code.",
            },
            TESTING,
          ],
        },
      ],
    },
  },
  {
    // Tests: the core's own rule, with its helpers (vitest and fast-check are packages).
    files: ["src/lib/core/**/*.test.ts", "src/lib/core/testing/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            TAURI,
            {
              group: ["\\#lib/*", "!\\#lib/core", "!\\#lib/paraglide"],
              message: "src/lib/core must not depend on UI, rendering or platform code.",
            },
          ],
        },
      ],
    },
  },
  layer("render", ["core", "render"]),
  layer("mypaint", ["core", "mypaint"]),
  layer("platform", ["core", "platform"], { tauri: true }),
  // Everything but the lab pages' code.
  layer("app", ["core", "render", "mypaint", "platform", "app"]),
);
