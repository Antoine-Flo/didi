<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<main>
  <h1>Didi — Lab</h1>
  <p><a href={resolve("/")}>← Retour à l'éditeur</a></p>
  <ul>
    <li>
      <a href={resolve("/lab/tablet")}>Tablette : pression, inclinaison, fréquence, latence</a>
    </li>
    <li>
      <a href={resolve("/lab/stress")}>Stress : toile 4096 × 4096, 10 calques à moitié remplis</a>
    </li>
    <li>
      <a href={resolve("/lab/stress?layers=20&fill=1")}>Stress lourd : 20 calques pleins (1,3 Go)</a
      >
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
