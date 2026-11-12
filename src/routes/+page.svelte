<script lang="ts">
  // The website's landing page, rendered at build time: what Didi is, and the way into the
  // app. The desktop app opens on /app and never shows it.

  import { Moon, Sun } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { buildTheme, DEFAULT_CHOICE, TOKENS, type ThemeMode } from "#lib/app/prefs/theme.js";
  import { DISCORD } from "#lib/app/shared/feedback-links.js";
  import DiscordLogo from "#lib/app/ui/widgets/DiscordLogo.svelte";
  import { m } from "#lib/paraglide/messages.js";

  // The app's theme, as CSS variables on the page (applyTheme needs the DOM): as the system is
  // set, unless chosen with the button. The choice is the documentation's (Starlight's), so
  // that both look the same: kept under its key, and read before the page shows.
  const THEME_KEY = "starlight-theme";
  const tokens = (mode: ThemeMode) => {
    const theme = buildTheme({ ...DEFAULT_CHOICE, mode });
    return TOKENS.map((t) => `--${t}: ${theme.tokens[t]}`).join("; ") + `; color-scheme: ${mode}`;
  };
  const themeCss =
    `main { ${tokens("dark")} } ` +
    `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) main { ${tokens("light")} } } ` +
    `:root[data-theme="light"] main { ${tokens("light")} }`;
  const themeScript =
    `const t = localStorage.getItem("${THEME_KEY}");` +
    `if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;`;
  // Split, or the component's own script would end there.
  const themeHead = `<style>${themeCss}</style><script>${themeScript}<` + `/script>`;

  const shownMode = (): ThemeMode => {
    const chosen = document.documentElement.dataset.theme;
    if (chosen === "light" || chosen === "dark") {
      return chosen;
    }
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  };

  let mode = $state<ThemeMode>("dark");
  onMount(() => {
    mode = shownMode();
  });

  function switchTheme() {
    mode = shownMode() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = mode;
    localStorage.setItem(THEME_KEY, mode);
  }
</script>

<svelte:head>
  <title>{m.site_title()}</title>
  <meta name="description" content={m.about_description()} />
  <!-- Built here from the theme's own values, nothing from outside. The script runs before
       the page shows, so that a chosen theme does not flash the other one first. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html themeHead}
</svelte:head>

<main>
  <button
    class="theme"
    onclick={switchTheme}
    title={mode === "dark" ? m.site_theme_light() : m.site_theme_dark()}
    aria-label={mode === "dark" ? m.site_theme_light() : m.site_theme_dark()}
  >
    {#if mode === "dark"}<Sun />{:else}<Moon />{/if}
  </button>
  <h1>Didi</h1>
  <p>{m.about_description()}</p>
  <!-- Loaded as a new page: preloading the editor on hover added its global styles (ui.css)
       to this page, which moved the text. -->
  <a class="open" href={resolve("/(app)/app")} data-sveltekit-reload>{m.site_open()}</a>
  <!-- Not a SvelteKit page but the website (website/): no resolve(), the browser loads it. -->
  <nav class="links">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href="/doc/" data-sveltekit-reload>{m.site_docs()}</a>
  </nav>
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a class="discord" href={DISCORD} target="_blank" rel="noopener">
    <span class="discord-icon"><DiscordLogo /></span>
    <span class="discord-text">
      <span class="discord-title">{m.site_discord()}</span>
      <span class="discord-detail">{m.site_discord_detail()}</span>
    </span>
  </a>
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
  }

  /* Dark or light, in the top right corner. */
  .theme {
    position: fixed;
    top: calc(var(--space) * 2);
    right: calc(var(--space) * 2);
    display: flex;
    padding: var(--space);
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .theme:hover {
    background: var(--hover);
    color: var(--text);
  }

  .theme :global(svg) {
    width: 20px;
    height: 20px;
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

  /* The way to the testers: a card under the links, quieter than "Open". */
  .discord {
    display: flex;
    align-items: center;
    gap: calc(var(--space) * 1.5);
    margin-top: calc(var(--space) * 2);
    padding: var(--space) calc(var(--space) * 2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    text-align: left;
    text-decoration: none;
  }

  .discord:hover {
    border-color: var(--text-faint);
  }

  .discord-icon {
    flex: none;
    width: 28px;
    height: 28px;
  }

  .discord-text {
    display: flex;
    flex-direction: column;
  }

  .discord-title {
    font-size: 15px;
  }

  .discord-detail {
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
