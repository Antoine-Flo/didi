<script lang="ts">
  // The contents of a layer's row in the layers panel: its visibility, preview, name (or the
  // field renaming it), transparency lock and lock. The row itself, dragged to reorder, is the
  // panel's.

  import { Eye, EyeOff, Lock, LockOpen } from "@lucide/svelte";
  import AlphaLockIcon from "#lib/app/ui/panels/AlphaLockIcon.svelte";
  import LayerThumb from "#lib/app/ui/panels/LayerThumb.svelte";
  import type { LayerProps, ReadonlyTileStore } from "#lib/core/document/layer.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    layer,
    stamp,
    renaming,
    update,
    run,
    onrename,
    onstartrename,
    oncancelrename,
  }: {
    layer: {
      id: string;
      name: string;
      visible: boolean;
      locked: boolean;
      alphaLocked: boolean;
      tiles: ReadonlyTileStore;
    };
    /** Changes when the layer's preview must be redrawn. */
    stamp: number;
    /** The name is being edited. */
    renaming: boolean;
    update: (id: string, changes: Partial<LayerProps>) => void;
    run: (command: string, params?: unknown) => void;
    /** The name's field is done: its value is the new name. */
    onrename: (input: HTMLInputElement) => void;
    onstartrename: () => void;
    oncancelrename: () => void;
  } = $props();
</script>

<button
  class="icon"
  class:off={!layer.visible}
  title={layer.visible ? m.layers_hide() : m.layers_show()}
  onclick={() => update(layer.id, { visible: !layer.visible })}
>
  {#if layer.visible}<Eye />{:else}<EyeOff />{/if}
</button>
<button
  class="thumb-button"
  title={m.layers_thumb_tip()}
  onclick={() => run("layer.select", { id: layer.id })}
  ondblclick={() => run("selection.layerContent", { id: layer.id })}
>
  <LayerThumb tiles={layer.tiles} {stamp} />
</button>
{#if renaming}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    type="text"
    value={layer.name}
    autofocus
    onfocus={(e) => e.currentTarget.select()}
    onblur={(e) => onrename(e.currentTarget)}
    onkeydown={(e) => {
      if (e.key === "Enter") {
        onrename(e.currentTarget);
      }
      if (e.key === "Escape") {
        oncancelrename();
      }
    }}
  />
{:else}
  <button
    class="name"
    title={m.layers_name_tip()}
    onclick={() => run("layer.select", { id: layer.id })}
    ondblclick={onstartrename}>{layer.name}</button
  >
{/if}
<button
  class="icon"
  class:off={!layer.alphaLocked}
  title={layer.alphaLocked ? m.layers_unlock_alpha() : m.layers_lock_alpha()}
  onclick={() => update(layer.id, { alphaLocked: !layer.alphaLocked })}
>
  <AlphaLockIcon locked={layer.alphaLocked} />
</button>
<button
  class="icon"
  class:off={!layer.locked}
  title={layer.locked ? m.layers_unlock() : m.layers_lock()}
  onclick={() => update(layer.id, { locked: !layer.locked })}
>
  {#if layer.locked}<Lock />{:else}<LockOpen />{/if}
</button>

<style>
  .name,
  input {
    flex: 1;
    min-width: 0;
  }

  /* Only the thumbnail shows. */
  .thumb-button {
    display: flex;
    flex: none;
    align-items: center;
    padding: 0;
    background: none;
    border: none;
  }

  .thumb-button:hover:not(:disabled) {
    background: none;
  }

  .name {
    overflow: hidden;
    padding: 0 calc(var(--space) / 2);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name:hover:not(:disabled) {
    background: none;
  }

  .off {
    color: var(--text-faint);
  }
</style>
