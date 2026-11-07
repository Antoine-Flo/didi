<script lang="ts">
  // The transparency lock of a layer, like Krita's: a small checkerboard, with a padlock
  // over it when locked. Sized like the Lucide icons (see ui.css).

  let { locked }: { locked: boolean } = $props();

  /** Checkerboard cells: 4 × 4 in a 20-pixel square, as wide as Lucide's lock. */
  const CELLS = Array.from({ length: 16 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4) })).filter(
    (c) => (c.x + c.y) % 2 === 0,
  );
  const id = $props.id();
</script>

<svg class="lucide-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  {#if locked}
    <!-- The checkerboard is cut around the padlock, so that it stands out. -->
    <mask id="cut-{id}">
      <rect width="24" height="24" fill="white" />
      <rect x="10.5" y="8.5" width="13.5" height="15.5" rx="2" fill="black" />
    </mask>
  {/if}
  <g mask={locked ? `url(#cut-${id})` : undefined}>
    <rect
      x="2.75"
      y="2.75"
      width="18.5"
      height="18.5"
      rx="1.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
    {#each CELLS as c (c.x * 4 + c.y)}
      <rect x={2 + c.x * 5} y={2 + c.y * 5} width="5" height="5" />
    {/each}
  </g>
  {#if locked}
    <path
      d="M14.5 15v-2.5a2.5 2.5 0 0 1 5 0v2.5"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
    <rect x="12" y="15" width="10" height="7.5" rx="1.5" />
  {/if}
</svg>
