<script lang="ts">
  // Bundled brushes with their previews, one group at a time. Erasers are shown for the
  // eraser tool, painting brushes for the others.

  import { asset } from "$app/paths";
  import type { AssetPath } from "$app/types";
  import Select from "#lib/app/widgets/Select.svelte";
  import { brushGroups } from "#lib/mypaint/brushes.js";

  let {
    eraser,
    selected,
    onselect,

    /** Id of the current brush. */
  }: {
    eraser: boolean;
    selected: string;
    onselect: (id: string) => void;
  } = $props();

  /** Previews are in static/brushes/, one per bundled brush. */
  const preview = (id: string) => `brushes/${id}.png` as AssetPath;

  const groups = $derived(brushGroups(eraser));
  // The open group, for brushes and for erasers.
  let open = $state({ brush: "Essentials", eraser: "Essentials" });
  const kind = $derived(eraser ? "eraser" : "brush");
  const group = $derived(groups.find((g) => g.label === open[kind]) ?? groups[0]);
</script>

<div class="browser">
  <Select
    title="Brush set"
    items={groups.map((g) => ({ value: g.label, label: g.label }))}
    value={group.label}
    onchange={(label) => (open[kind] = label)}
  />

  <ul>
    {#each group.brushes as brush (brush.id)}
      <li>
        <button class:active={brush.id === selected} onclick={() => onselect(brush.id)}>
          <img src={asset(preview(brush.id))} alt="" loading="lazy" draggable="false" />

          <span>{brush.name}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .browser {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
    min-height: 0;
  }

  ul {
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  button {
    display: flex;
    align-items: center;
    gap: var(--space);
    width: 100%;
    height: auto;
    padding: 3px;
    text-align: left;
  }

  img {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-small);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
