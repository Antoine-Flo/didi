// The documentation (/doc) and the devlog (/devlog) of didipaint.com. The rest of the site
// (/ and /app) is the SvelteKit app at the root of the repository: `npm run deploy` there
// builds both and copies this site's dist/ into the app's build/ (see doc/DECISIONS.md).
//
// No `base`: the pages sit under doc/ and devlog/ in src/content/docs/, so the two parts get
// their own URLs, and the site title links to the landing page at /.
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";

export default defineConfig({
  site: "https://didipaint.com",
  // This project's tsconfig for every file, packages included. Otherwise the resolver looks
  // up to the app's tsconfig.json, which can't load without the app's packages (CI).
  vite: { tsconfig: "./tsconfig.json" },
  // Same URLs as the app's pages (wrangler.jsonc: auto-trailing-slash).
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: [
    starlight({
      title: "Didi",
      description: "Drawing app for painting and pixel art.",
      // The app's favicon, served by the app at the site's root.
      favicon: "/favicon.png",
      // The site's 404 would also answer for the app's URLs.
      disable404Route: true,
      customCss: ["./src/styles/theme.css"],
      sidebar: [
        { label: "Getting started", items: ["doc", "doc/tablet", "doc/web-and-desktop"] },
        { label: "Drawing", items: ["doc/modes", "doc/shortcuts"] },
        { label: "Files", items: ["doc/files"] },
      ],
      plugins: [
        starlightBlog({
          prefix: "devlog",
          title: "Devlog",
          authors: { antoine: { name: "Antoine" } },
        }),
      ],
    }),
  ],
});
