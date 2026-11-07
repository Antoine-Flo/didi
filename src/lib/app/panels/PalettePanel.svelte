<script lang="ts">
  import { CopyPlus, Lock, LockOpen, Menu, Plus } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import { sameColor, toHex, type RGB } from "#lib/core/color/color.js";
  import type { PaletteLibrary } from "#lib/core/color/palette.js";
  import CopyPaletteDialog from "#lib/app/dialogs/CopyPaletteDialog.svelte";
  import Select from "#lib/app/widgets/Select.svelte";

  let {
    library,
    version,
    color,
    fill = false,
    swatchSize = 18,
    onzoom,
    tip,
    run,
  }: {
    library: PaletteLibrary | null;
    /** Changes whenever the library changes, to refresh the panel. */
    version: number;
    /** The current color, highlighted in the palette. Null: none. */
    color: RGB | null;
    /**
     * Fills the height given by the parent (a resized panel), the colors scrolling inside.
     * Otherwise as tall as its content, the colors scrolling past a fixed height.
     */
    fill?: boolean;
    /** Smallest width of a swatch, in pixels: they grow to fill each row. */
    swatchSize?: number;
    /** Ctrl + wheel over the swatches: their size times `factor`. */
    onzoom?: (factor: number) => void;
    tip: (command: string) => string;
    run: (command: string, params?: unknown) => void;
  } = $props();

  const info = $derived.by(() => {
    void version;
    if (!library) return null;
    return {
      names: library.palettes.map((p) => p.name),
      /** Each palette's colors, as hex, for the list of palettes. */
      previews: library.palettes.map((p) => p.colors.map(toHex)),
      builtin: library.palettes.map((_, i) => library.isBuiltin(i)),
      index: library.activeIndex,
      colors: library.active?.colors.map((c) => [...c] as RGB) ?? [],
      hasActive: library.active !== null,
      locked: library.locked,
      editable: library.editable !== null,
    };
  });
  const editable = $derived(info?.editable === true);
  const builtinShown = $derived(info?.hasActive === true && info.builtin[info.index]);

  /** Name of the built-in palette being copied, while its dialog is open. */
  let copying = $state<string | null>(null);

  // While the menu is open, a click on the canvas only closes it.
  let menuOpen = false;
  function setMenuOpen(next: boolean) {
    if (next === menuOpen) return;
    menuOpen = next;
    if (next) popupOpened();
    else popupClosed();
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setMenuOpen(false));

  let renaming = $state(false);
  function rename(input: HTMLInputElement) {
    if (!renaming) return;
    renaming = false;
    if (input.value.trim()) run("palette.rename", { name: input.value });
  }
</script>

<section class="section palettes" class:fill>
  <div class="header">
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
          items={info.names.map((name, i) => ({
            value: String(i),
            label: name,
            group: info.builtin[i] ? "Built-in" : "My palettes",
          }))}
          value={String(info.index)}
          onchange={(v) => run("palette.select", { index: Number(v) })}
        >
          {#snippet item({ value, label })}
            {@const colors = info.previews[Number(value)] ?? []}
            <div class="option">
              <span class="option-name">{label}</span>
              {#if colors.length}
                <div class="preview">
                  {#each colors as c, i (i)}<span style:background={c}></span>{/each}
                </div>
              {/if}
            </div>
          {/snippet}
        </Select>
      {/if}
    {:else}
      <span class="spacer"></span>
    {/if}
    {#if builtinShown && info}
      <button
        class="icon"
        title="Make an editable copy"
        onclick={() => (copying = info.names[info.index])}
      >
        <CopyPlus />
      </button>
    {:else}
      <button
        class="icon"
        title={info?.locked ? "Unlock palettes" : "Lock palettes"}
        aria-pressed={info?.locked ?? false}
        disabled={!info}
        onclick={() => run("palette.toggleLock")}
      >
        {#if info?.locked}<Lock />{:else}<LockOpen />{/if}
      </button>
    {/if}
    <DropdownMenu.Root onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger class="palette-menu-trigger" title="Palette menu" disabled={!info}>
        <Menu />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class="menu-content"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={(e) => {
            // "Rename": the name's field keeps the focus, instead of the menu's button.
            if (renaming) e.preventDefault();
          }}
        >
          <DropdownMenu.Item class="menu-item" onSelect={() => run("palette.new")}>
            New palette
          </DropdownMenu.Item>
          <DropdownMenu.Item class="menu-item" onSelect={() => run("palette.import")}>
            Import palette (.hex)…
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="menu-item"
            disabled={!editable}
            onSelect={() => (renaming = true)}
          >
            Rename palette
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="menu-item"
            disabled={!editable}
            onSelect={() => run("palette.delete")}
          >
            Delete palette
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>

  {#if info?.hasActive}
    <div
      class="swatches"
      style:--swatch-size="calc({swatchSize}px * var(--ui-scale))"
      onwheel={(e) => {
        if (!e.ctrlKey || !onzoom) return;
        e.preventDefault();
        onzoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      }}
    >
      {#each info.colors as c, i (i)}
        <button
          class="swatch"
          class:current={color && sameColor(c, color)}
          style:background={toHex(c)}
          title={editable ? `${toHex(c)} · Right-click to remove` : toHex(c)}
          aria-label={toHex(c)}
          onclick={() => run("color.set", { color: toHex(c) })}
          oncontextmenu={(e) => {
            e.preventDefault();
            run("palette.removeColor", { index: i });
          }}
        ></button>
      {/each}
      {#if editable}
        <button
          class="swatch add"
          title={tip("palette.addColor")}
          aria-label="Add the current color"
          disabled={!color}
          onclick={() => run("palette.addColor")}
        >
          <Plus />
        </button>
      {/if}
    </div>
  {:else if info}
    <span class="hint">No palette. Create or import one (.hex, e.g. from Lospec).</span>
  {/if}
</section>

<CopyPaletteDialog
  source={copying}
  oncopy={(name) => run("palette.duplicate", { name })}
  onclose={() => (copying = null)}
/>

<style>
  /* An item of the palettes' list: the name, its colors below in a strip. */
  .option {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-width: 0;
  }

  .option-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview {
    display: flex;
    height: calc(8px * var(--ui-scale));
    overflow: hidden;
    border-radius: 2px;
  }

  .preview span {
    flex: 1;
  }

  /* The palette's name, then its lock and its menu. */
  .header {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .header > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }

  :global(.palette-menu-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  :global(.palette-menu-trigger[data-state="open"]) {
    background: var(--hover);
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--swatch-size), 1fr));
    align-content: start;
    gap: 3px;
    /* Room for the ring of the current color, drawn outside the swatch: the scrolling
       container clips whatever passes its edges. */
    padding: 2px;
    max-height: calc(160px * var(--ui-scale));
    overflow-y: auto;
  }

  /* The colors take the space left, whatever their own height: WebKit does not grow a
     scrolling grid back to its content height once it has shrunk. */
  .fill {
    flex: 1;
    min-height: 0;
  }

  .fill .swatches {
    flex: 1 1 0;
    min-height: 0;
    max-height: none;
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

  .add :global(svg) {
    width: calc(12px * var(--ui-scale));
    height: calc(12px * var(--ui-scale));
  }
</style>
