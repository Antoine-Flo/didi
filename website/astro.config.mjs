// The documentation (/doc) of didipaint.com. The rest of the site
// (/ and /app) is the SvelteKit app at the root of the repository: `npm run deploy` there
// builds both and copies this site's dist/ into the app's build/ (see doc/DECISIONS.md).
//
// No `base`: the pages sit under doc/ in src/content/docs/, so they get their own URL, and
// the site title links to the landing page at /.
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightSidebarTopics from "starlight-sidebar-topics";

export default defineConfig({
  site: "https://didipaint.com",
  // This project's tsconfig for every file, packages included. Otherwise the resolver looks
  // up to the app's tsconfig.json, which can't load without the app's packages (CI).
  vite: { tsconfig: "./tsconfig.json" },
  // Same URLs as the app's pages (wrangler.jsonc: auto-trailing-slash).
  trailingSlash: "ignore",
  build: { format: "directory" },
  // `npm run dev:site` at the root of the repository. Not 1420: the app uses it in Tauri.
  server: { port: 1440, open: "/doc/" },
  integrations: [
    starlight({
      title: "Didi",
      description: "A modern pixel art editor, free and everywhere.",
      // The app's favicon, served by the app at the site's root.
      favicon: "/favicon.png",
      // The site's 404 would also answer for the app's URLs.
      disable404Route: true,
      customCss: ["./src/styles/theme.css"],
      plugins: [
        // Two sidebars: one for the users, one for the developers (how the code works).
        starlightSidebarTopics([
          {
            label: "User guide",
            link: "/doc/",
            icon: "open-book",
            items: [
              { label: "Getting started", items: ["doc", "doc/tablet", "doc/web-and-desktop"] },
              { label: "Drawing", items: ["doc/shortcuts"] },
              { label: "Files", items: ["doc/files"] },
            ],
          },
          {
            label: "Developer docs",
            link: "/doc/dev/",
            icon: "seti:config",
            items: [
              {
                label: "Start here",
                items: [
                  "doc/dev",
                  "doc/dev/start/architecture",
                  "doc/dev/start/from-pen-to-screen",
                ],
              },
              // The pages set their order with `sidebar.order`.
              { label: "Core", items: [{ autogenerate: { directory: "doc/dev/core" } }] },
              { label: "Rendering", items: [{ autogenerate: { directory: "doc/dev/render" } }] },
              { label: "Platform", items: [{ autogenerate: { directory: "doc/dev/platform" } }] },
              { label: "App", items: [{ autogenerate: { directory: "doc/dev/app" } }] },
            ],
          },
        ]),
      ],
    }),
  ],
});
