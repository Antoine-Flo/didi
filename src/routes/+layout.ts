// Every page is built ahead as a static file (adapter-static), for the desktop app and for
// the website alike: no server. The app's pages are rendered in the browser only (see
// (app)/+layout.ts); the landing page is rendered at build time, so it shows without
// JavaScript and search engines read it.
export const prerender = true;
