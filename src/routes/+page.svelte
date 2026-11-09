<script lang="ts">
  // The website's landing page, rendered at build time: what Didi is, and the way into the
  // app. The desktop app opens on /app and never shows it.

  import { resolve } from "$app/paths";
  import { buildTheme, DEFAULT_CHOICE, TOKENS } from "#lib/app/prefs/theme.js";
  import { m } from "#lib/paraglide/messages.js";

  // The app's theme, as CSS variables on the page (applyTheme needs the DOM).
  const theme = buildTheme(DEFAULT_CHOICE);
  const tokens = TOKENS.map((t) => `--${t}: ${theme.tokens[t]}`).join("; ");
</script>

<svelte:head>
  <title>{m.site_title()}</title>
  <meta name="description" content={m.about_description()} />
</svelte:head>

<main style={tokens}>
  <h1>Didi</h1>
  <p>{m.about_description()}</p>
  <!-- Loaded as a new page: preloading the editor on hover added its global styles (ui.css)
       to this page, which moved the text. -->
  <a class="open" href={resolve("/(app)/app")} data-sveltekit-reload>{m.site_open()}</a>
  <!-- Not SvelteKit pages but the website (website/): no resolve(), the browser loads them. -->
  <nav class="links">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href="/doc/" data-sveltekit-reload>{m.site_docs()}</a>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href="/devlog/" data-sveltekit-reload>{m.site_devlog()}</a>
  </nav>
</main>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
  }

  main {
    --ui-scale: 1;
    box-sizing: border-box;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--space) * 2);
    padding: calc(var(--space) * 4);
    text-align: center;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    color-scheme: dark;
  }

  h1 {
    margin: 0;
    font-size: 48px;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 18px;
    color: var(--text-muted);
  }

  .open {
    padding: var(--space) calc(var(--space) * 3);
    border-radius: var(--radius);
    background: var(--selected);
    color: var(--text);
    font-size: 16px;
    text-decoration: none;
  }

  .open:hover {
    outline: 1px solid var(--text-faint);
  }

  .links {
    display: flex;
    gap: calc(var(--space) * 3);
  }

  .links a {
    font-size: 14px;
    color: var(--text-muted);
  }

  .links a:hover {
    color: var(--text);
  }
</style>
