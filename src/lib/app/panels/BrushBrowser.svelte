<script lang="ts">
  // The brushes of one set, with their previews: the first selection, then the others under
  // "More brushes", folded unless the current brush is there.

  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import { asset } from "$app/paths";
  import type { AssetPath } from "$app/types";
  import { setBrushes, type BrushSet } from "#lib/mypaint/brush-sets.js";

  let {
    set,
    selected,
    onselect,
  }: {
    set: BrushSet;
    /** Id of the current brush. */
    selected: string;
    onselect: (id: string) => void;
  } = $props();

  /** Previews are in static/brushes/, one per bundled brush. */
  const preview = (id: string) => `brushes/${id}.png` as AssetPath;

  const brushes = $derived(setBrushes(set));
  // svelte-ignore state_referenced_locally
  let showMore = $state(set.more.includes(selected));
</script>

{#snippet list(items: typeof brushes.picks)}
  <ul>
    {#each items as brush (brush.id)}
      <li>
        <button class:active={brush.id === selected} onclick={() => onselect(brush.id)}>
          <img src={asset(preview(brush.id))} alt="" loading="lazy" draggable="false" />

          <span>{brush.name}</span>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<div class="browser">
  {@render list(brushes.picks)}

  {#if brushes.more.length > 0}
    <button class="more" onclick={() => (showMore = !showMore)}>
      {#if showMore}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
      More brushes
    </button>

    {#if showMore}{@render list(brushes.more)}{/if}
  {/if}
</div>

<style>
  .browser {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li button {
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

  .more {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    padding: 0 calc(var(--space) / 2);
    color: var(--text-muted);
  }
</style>
