<script lang="ts">
  import { FileUp, Pencil, Plus, Trash2 } from "@lucide/svelte";
  import { sameColor, toHex, type RGB } from "$lib/core/color";
  import type { PaletteLibrary } from "$lib/core/palette";
  import Select from "$lib/app/Select.svelte";

  let {
    library,
    version,
    color,
    tip,
    run,
  }: {
    library: PaletteLibrary | null;
    /** Changes whenever the library changes, to refresh the panel. */
    version: number;
    /** The current color, highlighted in the palette. */
    color: RGB;
    tip: (command: string) => string;
    run: (command: string, params?: unknown) => void;
  } = $props();

  const info = $derived.by(() => {
    void version;
    if (!library) return null;
    return {
      names: library.palettes.map((p) => p.name),
      index: library.activeIndex,
      colors: library.active?.colors.map((c) => [...c] as RGB) ?? [],
      hasActive: library.active !== null,
    };
  });

  let renaming = $state(false);
  function rename(input: HTMLInputElement) {
    if (!renaming) return;
    renaming = false;
    if (input.value.trim()) run("palette.rename", { name: input.value });
  }
</script>

<section class="section palettes">
  <div class="header">
    <span class="section-title">Palette</span>
    <div class="actions">
      <button class="icon" title={tip("palette.new")} onclick={() => run("palette.new")}>
        <Plus size={16} />
      </button>
      <button class="icon" title={tip("palette.import")} onclick={() => run("palette.import")}>
        <FileUp size={16} />
      </button>
      <button
        class="icon"
        title="Rename palette"
        disabled={!info?.hasActive}
        onclick={() => (renaming = true)}
      >
        <Pencil size={16} />
      </button>
      <button
        class="icon"
        title={tip("palette.delete")}
        disabled={!info?.hasActive}
        onclick={() => run("palette.delete")}
      >
        <Trash2 size={16} />
      </button>
    </div>
  </div>

  {#if info?.hasActive}
    {#if renaming}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        value={info.names[info.index]}
        autofocus
        onfocus={(e) => e.currentTarget.select()}
        onblur={(e) => rename(e.currentTarget)}
        onkeydown={(e) => {
          if (e.key === "Enter") rename(e.currentTarget);
          if (e.key === "Escape") renaming = false;
        }}
      />
    {:else}
      <Select
        title="Palette"
        items={info.names.map((name, i) => ({ value: String(i), label: name }))}
        value={String(info.index)}
        onchange={(v) => run("palette.select", { index: Number(v) })}
      />
    {/if}

    <div class="swatches">
      {#each info.colors as c, i (i)}
        <button
          class="swatch"
          class:current={sameColor(c, color)}
          style:background={toHex(c)}
          title="{toHex(c)} · Right-click to remove"
          aria-label={toHex(c)}
          onclick={() => run("color.set", { color: toHex(c) })}
          oncontextmenu={(e) => {
            e.preventDefault();
            run("palette.removeColor", { index: i });
          }}
        ></button>
      {/each}
      <button
        class="swatch add"
        title={tip("palette.addColor")}
        aria-label="Add the current color"
        onclick={() => run("palette.addColor")}
      >
        <Plus size={12} />
      </button>
    </div>
  {:else if info}
    <span class="hint">No palette. Create or import one (.hex, e.g. from Lospec).</span>
  {/if}
</section>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .actions {
    display: flex;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18px, 1fr));
    gap: 3px;
    max-height: 160px;
    overflow-y: auto;
  }

  .swatch {
    min-width: 0;
    height: auto;
    aspect-ratio: 1;
    padding: 0;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px #ffffff1a;
  }

  .swatch.current {
    box-shadow:
      0 0 0 1px var(--panel),
      0 0 0 2px var(--text);
  }

  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    box-shadow: inset 0 0 0 1px var(--field-border);
  }
</style>
