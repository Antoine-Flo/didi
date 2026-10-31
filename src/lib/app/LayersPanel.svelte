<script lang="ts">
  import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from "@lucide/svelte";
  import type { Editor } from "$lib/core/editor";
  import { BLEND_MODES, type BlendMode, type LayerProps } from "$lib/core/layer";

  /** `version` changes whenever the editor changes, to refresh the panel. */
  let { editor, version }: { editor: Editor; version: number } = $props();

  const BLEND_LABELS: Record<BlendMode, string> = {
    normal: "Normal",
    screen: "Écran",
    add: "Addition",
  };

  // Top layer first, like every drawing app.
  const layers = $derived.by(() => {
    void version;
    const activeId = editor.activeLayer?.id;
    return [...editor.drawing.layers].reverse().map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      active: l.id === activeId,
    }));
  });

  const active = $derived.by(() => {
    void version;
    const layer = editor.activeLayer;
    if (!layer) return null;
    return {
      id: layer.id,
      name: layer.name,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      index: editor.drawing.indexOf(layer.id),
    };
  });

  const count = $derived.by(() => {
    void version;
    return editor.drawing.layers.length;
  });

  function update(id: string, changes: Partial<LayerProps>) {
    editor.commands.execute("layer.update", { id, changes });
  }

  // Dragging the opacity slider makes one undo step.
  let dragging = false;
  function startOpacity() {
    if (dragging) return;
    dragging = true;
    editor.history.begin("Opacité du calque");
  }
  function endOpacity() {
    if (!dragging) return;
    dragging = false;
    editor.history.end();
  }
</script>

<div class="panel">
  <ul>
    {#each layers as layer (layer.id)}
      <li class:active={layer.active}>
        <button
          class="icon"
          title={layer.visible ? "Masquer" : "Afficher"}
          onclick={() => update(layer.id, { visible: !layer.visible })}
        >
          {#if layer.visible}<Eye size={16} />{:else}<EyeOff size={16} />{/if}
        </button>
        <button class="name" onclick={() => editor.setActiveLayer(layer.id)}>{layer.name}</button>
        <button
          class="icon"
          title={layer.locked ? "Déverrouiller" : "Verrouiller"}
          onclick={() => update(layer.id, { locked: !layer.locked })}
        >
          {#if layer.locked}<Lock size={16} />{:else}<LockOpen size={16} />{/if}
        </button>
      </li>
    {/each}
  </ul>

  <div class="actions">
    <button
      class="icon"
      title="Nouveau calque"
      onclick={() => editor.commands.execute("layer.add")}
    >
      <Plus size={16} />
    </button>
    <button
      class="icon"
      title="Monter"
      disabled={!active || active.index >= count - 1}
      onclick={() => active && editor.commands.execute("layer.move", { index: active.index + 1 })}
    >
      <ArrowUp size={16} />
    </button>
    <button
      class="icon"
      title="Descendre"
      disabled={!active || active.index <= 0}
      onclick={() => active && editor.commands.execute("layer.move", { index: active.index - 1 })}
    >
      <ArrowDown size={16} />
    </button>
    <button
      class="icon"
      title="Supprimer"
      disabled={!active}
      onclick={() => editor.commands.execute("layer.remove")}
    >
      <Trash2 size={16} />
    </button>
  </div>

  {#if active}
    <div class="props">
      <label>
        Nom
        <input
          type="text"
          value={active.name}
          onchange={(e) => {
            const name = e.currentTarget.value.trim();
            if (name) update(active.id, { name });
            else e.currentTarget.value = active.name;
          }}
        />
      </label>
      <label>
        Opacité {Math.round(active.opacity * 100)} %
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(active.opacity * 100)}
          onpointerdown={startOpacity}
          onpointerup={endOpacity}
          onpointercancel={endOpacity}
          oninput={(e) => update(active.id, { opacity: Number(e.currentTarget.value) / 100 })}
        />
      </label>
      <label>
        Fusion
        <select
          value={active.blendMode}
          onchange={(e) => update(active.id, { blendMode: e.currentTarget.value as BlendMode })}
        >
          {#each BLEND_MODES as mode (mode)}
            <option value={mode}>{BLEND_LABELS[mode]}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
  }

  li.active {
    background: #3a4a66;
  }

  .name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 2px;
  }

  .props {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
