<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<main>
  <h1>Didi</h1>
  <h2>Lab</h2>
  <ul>
    <li>
      <a href={resolve("/lab/tablet")}>Tablette : pression, inclinaison, fréquence, latence</a>
    </li>
    <li>
      <a href={resolve("/lab/render")}>Rendu : tamponnage PixiJS, calques, temps de frame</a>
    </li>
  </ul>
</main>

<style>
  :global(html, body) {
    margin: 0;
    background: #1d1d1f;
    color: #ccc;
    font:
      13px/1.5 system-ui,
      sans-serif;
  }

  main {
    padding: 24px;
  }

  a {
    color: #8ab4f8;
  }
</style>
