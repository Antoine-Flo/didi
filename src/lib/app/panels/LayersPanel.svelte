<script lang="ts">
  import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from "@lucide/svelte";
  import Select from "#lib/app/widgets/Select.svelte";
  import Slider from "#lib/app/widgets/Slider.svelte";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { BLEND_MODES, type BlendMode, type LayerProps } from "#lib/core/document/layer.js";

  let {
    editor,
    version,
    tip,
    run,
  }: {
    editor: Editor;
    /** Changes whenever the editor changes, to refresh the panel. */
    version: number;
    /** Tooltip of a command, with its shortcut. */
    tip: (command: string) => string;
    /** Runs a command (unless a stroke is in progress). */
    run: (command: string) => void;
  } = $props();

  const BLEND_LABELS: Record<BlendMode, string> = {
    normal: "Normal",
    screen: "Screen",
    add: "Add",
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

  // Double-click on a name to rename the layer.
  let renaming = $state<string | null>(null);
  function rename(id: string, input: HTMLInputElement) {
    if (renaming !== id) return;
    renaming = null;
    const name = input.value.trim();
    if (name) update(id, { name });
  }

  // Dragging the opacity slider makes one undo step.
  let dragging = false;
  function startOpacity() {
    if (dragging) return;
    dragging = true;
    editor.history.begin("Layer opacity");
  }
  function endOpacity() {
    if (!dragging) return;
    dragging = false;
    editor.history.end();
  }
</script>

<section class="section layers">
  <div class="header">
    <span class="section-title">Layers</span>
    <div class="actions">
      <button class="icon" title={tip("layer.add")} onclick={() => run("layer.add")}>
        <Plus size={16} />
      </button>
      <button
        class="icon"
        title={tip("layer.moveUp")}
        disabled={!active || active.index >= count - 1}
        onclick={() => run("layer.moveUp")}
      >
        <ArrowUp size={16} />
      </button>
      <button
        class="icon"
        title={tip("layer.moveDown")}
        disabled={!active || active.index <= 0}
        onclick={() => run("layer.moveDown")}
      >
        <ArrowDown size={16} />
      </button>
      <button
        class="icon"
        title={tip("layer.remove")}
        disabled={!active}
        onclick={() => run("layer.remove")}
      >
        <Trash2 size={16} />
      </button>
    </div>
  </div>

  {#if active}
    <div class="props">
      <div class="blend">
        <span class="label">Blend</span>
        <Select
          items={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABELS[mode] }))}
          value={active.blendMode}
          onchange={(mode) => update(active.id, { blendMode: mode as BlendMode })}
        />
      </div>
      <Slider
        label="Opacity"
        min={0}
        max={100}
        step={1}
        value={Math.round(active.opacity * 100)}
        display="{Math.round(active.opacity * 100)}%"
        onstart={startOpacity}
        onend={endOpacity}
        oninput={(v) => update(active.id, { opacity: v / 100 })}
      />
    </div>
  {/if}

  <ul>
    {#each layers as layer (layer.id)}
      <li class:active={layer.active}>
        <button
          class="icon"
          class:off={!layer.visible}
          title={layer.visible ? "Hide" : "Show"}
          onclick={() => update(layer.id, { visible: !layer.visible })}
        >
          {#if layer.visible}<Eye size={16} />{:else}<EyeOff size={16} />{/if}
        </button>
        {#if renaming === layer.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            value={layer.name}
            autofocus
            onfocus={(e) => e.currentTarget.select()}
            onblur={(e) => rename(layer.id, e.currentTarget)}
            onkeydown={(e) => {
              if (e.key === "Enter") rename(layer.id, e.currentTarget);
              if (e.key === "Escape") renaming = null;
            }}
          />
        {:else}
          <button
            class="name"
            title="Double-click to rename"
            onclick={() => editor.commands.execute("layer.select", { id: layer.id })}
            ondblclick={() => (renaming = layer.id)}>{layer.name}</button
          >
        {/if}
        <button
          class="icon"
          class:off={!layer.locked}
          title={layer.locked ? "Unlock" : "Lock"}
          onclick={() => update(layer.id, { locked: !layer.locked })}
        >
          {#if layer.locked}<Lock size={16} />{:else}<LockOpen size={16} />{/if}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .layers {
    min-height: 0;
    --slider-label-width: 4.5em;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .actions {
    display: flex;
  }

  .props {
    display: flex;
    flex-direction: column;
  }

  .blend {
    display: flex;
    align-items: center;
    gap: var(--space);
  }

  .blend .label {
    width: 4.5em;
    color: var(--text-muted);
  }

  .blend :global(.select-trigger) {
    flex: 1;
  }

  ul {
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    border-radius: var(--radius-small);
  }

  li.active {
    background: var(--selected);
  }

  .name,
  li input {
    flex: 1;
    min-width: 0;
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
