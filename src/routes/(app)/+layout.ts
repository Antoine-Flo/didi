// The app runs in the browser only: Tauri has no Node.js server, and the app needs the DOM
// from the start. Prerendering then writes an empty page that loads the app.
// See https://svelte.dev/docs/kit/single-page-apps and https://v2.tauri.app/start/frontend/sveltekit/
export const ssr = false;
