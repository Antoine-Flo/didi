<script lang="ts">
  // The grids' settings: the pixels' grid and the tiles' grid, each shown on its own, and the
  // tiles' size. Changes show at once. In the view's column's popup and the Grid settings dialog.

  import { isTileGridSize, MAX_TILE_GRID, type TileGrid } from "#lib/core/file/didi-file.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    pixelGrid,
    tileGrid,
    tip,
    run,
    ontilegrid,
  }: {
    /** The pixels' grid is shown (when zoomed in). */
    pixelGrid: boolean;
    tileGrid: TileGrid;
    tip: (id: string) => string;
    run: (id: string) => void;
    /** The tiles' grid changed (its size). */
    ontilegrid: (grid: TileGrid) => void;
  } = $props();

  /**
   * A side typed in: kept once valid (and the grid shown, to see it), else the field shows the
   * grid's again on leaving it.
   */
  function setSide(side: "width" | "height", value: number) {
    const next = { ...tileGrid, [side]: value, shown: true };
    if (isTileGridSize(next)) {
      ontilegrid(next);
    }
  }
</script>

<div class="grid-settings">
  <label class="check" title={tip("view.pixelGrid")}>
    <input type="checkbox" checked={pixelGrid} onchange={() => run("view.pixelGrid")} />
    {m.grid_pixels()}
  </label>
  <label class="check" title={tip("view.tileGrid")}>
    <input type="checkbox" checked={tileGrid.shown} onchange={() => run("view.tileGrid")} />
    {m.grid_tiles()}
  </label>
  <div class="fields">
    <input
      type="number"
      min="1"
      max={MAX_TILE_GRID}
      value={tileGrid.width}
      oninput={(e) => setSide("width", e.currentTarget.valueAsNumber)}
      onchange={(e) => (e.currentTarget.value = String(tileGrid.width))}
      aria-label={m.grid_tile_width()}
    />
    <span>×</span>
    <input
      type="number"
      min="1"
      max={MAX_TILE_GRID}
      value={tileGrid.height}
      oninput={(e) => setSide("height", e.currentTarget.valueAsNumber)}
      onchange={(e) => (e.currentTarget.value = String(tileGrid.height))}
      aria-label={m.grid_tile_height()}
    />
    <span class="muted">{m.image_size_unit()}</span>
  </div>
</div>

<style>
  .grid-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }

  .check {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
  }

  /* The tiles' size, under its switch. */
  .fields {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    padding-left: calc(var(--space) * 2);
  }

  .muted {
    color: var(--text-muted);
  }

  input[type="number"] {
    box-sizing: border-box;
    width: calc(64px * var(--ui-scale));
    height: var(--control-height);
    padding: 0 var(--space);
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }
</style>
