import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import svelteConfig from "./svelte.config.js";

export default ts.config(
  {
    ignores: ["build/", ".svelte-kit/", "src-tauri/", "node_modules/"],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
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
    // The core must stay independent from UI, rendering and platform.
    files: ["src/lib/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["pixi.js", "svelte", "svelte/*", "@tauri-apps/*", "$app/*", "$lib/*"],
              message: "src/lib/core must not depend on UI, rendering or platform code.",
            },
          ],
        },
      ],
    },
  },
);
