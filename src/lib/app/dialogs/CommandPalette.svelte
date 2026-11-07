<script lang="ts">
  import { Command, Dialog } from "bits-ui";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { formatChord, type KeymapIndex } from "#lib/app/commands/keymap.js";

  let {
    editor,
    keymap,
    run,
    open = $bindable(false),
  }: {
    editor: Editor;
    keymap: KeymapIndex;
    /** Runs a command (unless a stroke is in progress). */
    run: (command: string) => void;
    open?: boolean;
  } = $props();

  // Read when the palette opens: commands and their state may have changed since.
  const items = $derived.by(() => {
    if (!open) return [];
    return editor.commands
      .list()
      .filter((c) => !c.needsParams && c.id !== "app.commandPalette")
      .map((c) => ({
        id: c.id,
        title: c.title,
        enabled: editor.commands.isEnabled(c.id),
        keys: keymap.chordsFor(c.id).map(formatChord).join(", "),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  function choose(id: string) {
    open = false;
    run(id);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <!-- Closes on click (after the release), not on press: the press must not reach the
         canvas once the palette is gone, or it would start a stroke. -->
    <Dialog.Overlay class="command-palette-overlay" onclick={() => (open = false)} />
    <Dialog.Content class="command-palette" interactOutsideBehavior="ignore">
      <Dialog.Title class="sr-only">Command palette</Dialog.Title>
      <Command.Root>
        <Command.Input class="command-palette-input" placeholder="Search for a command…" />
        <Command.List class="command-palette-list">
          <Command.Viewport>
            <Command.Empty class="command-palette-empty">No command found.</Command.Empty>
            {#each items as item (item.id)}
              <Command.Item
                class="command-palette-item"
                value={item.id}
                keywords={[item.title]}
                disabled={!item.enabled}
                onSelect={() => choose(item.id)}
              >
                <span>{item.title}</span>
                {#if item.keys}<kbd>{item.keys}</kbd>{/if}
              </Command.Item>
            {/each}
          </Command.Viewport>
        </Command.List>
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Below the title bar, which stays usable. */
  :global(.command-palette-overlay) {
    position: fixed;
    inset: var(--titlebar-height) 0 0;
    z-index: 50;
    background: var(--overlay);
  }

  /* Centered by the layout, not by a transform: a translation of half a pixel blurs the
     text. */
  :global(.command-palette) {
    position: fixed;
    top: 15vh;
    right: 0;
    left: 0;
    z-index: 51;
    width: min(520px * var(--ui-scale), 90vw);
    margin: 0 auto;
    overflow: hidden;
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  :global(.command-palette-input) {
    box-sizing: border-box;
    width: 100%;
    height: calc(var(--control-height) + var(--space));
    padding: 0 var(--space);
    color: inherit;
    font: inherit;
    border: none;
    border-bottom: 1px solid var(--border);
    background: none;
    outline: none;
  }

  :global(.command-palette-list) {
    max-height: 50vh;
    overflow-y: auto;
    padding: calc(var(--space) / 2);
  }

  :global(.command-palette-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--space) * 2);
    height: var(--control-height);
    padding: 0 var(--space);
    border-radius: var(--radius-small);
    cursor: pointer;
  }

  :global(.command-palette-item[data-selected]) {
    background: var(--selected);
  }

  :global(.command-palette-item[data-disabled]) {
    color: var(--text-faint);
    cursor: default;
  }

  :global(.command-palette-empty) {
    padding: var(--space);
    color: var(--text-faint);
  }

  kbd {
    color: var(--text-muted);
    font: inherit;
  }
</style>
