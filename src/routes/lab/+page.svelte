<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<main>
  <h1>Didi — Lab</h1>
  <p><a href={resolve("/")}>← Back to the editor</a></p>
  <ul>
    <li>
      <a href={resolve("/lab/tablet")}>Tablet: pressure, tilt, rate, latency</a>
    </li>
    <li>
      <a href={resolve("/lab/stress")}>Stress: 4096 × 4096 canvas, 10 half-filled layers</a>
    </li>
    <li>
      <a href={resolve("/lab/stress?layers=20&fill=1")}>Heavy stress: 20 full layers (1.3 GB)</a>
    </li>
    <li>
      <a href={resolve("/lab/render")}>Rendering: PixiJS stamping, layers, frame time</a>
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
