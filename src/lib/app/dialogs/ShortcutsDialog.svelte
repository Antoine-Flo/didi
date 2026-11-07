<script lang="ts">
  // The list of keyboard shortcuts, by category, on two columns: each command and its keys,
  // those of the current mode included.

  import { Dialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import { formatChord, type KeymapIndex } from "#lib/app/commands/keymap.js";
  import type { Editor } from "#lib/core/editor/editor.js";

  let {
    editor,
    keymap,
    open = $bindable(false),
  }: {
    editor: Editor;
    keymap: KeymapIndex;
    open?: boolean;
  } = $props();

  /** Categories in display order, with the command prefixes they hold. */
  const CATEGORIES: { title: string; prefixes: string[] }[] = [
    { title: "Tools", prefixes: ["tool", "brush"] },
    { title: "Selection", prefixes: ["selection"] },
    { title: "Edit", prefixes: ["history"] },
    { title: "View", prefixes: ["view"] },
    { title: "Layers", prefixes: ["layer"] },
    { title: "File", prefixes: ["file", "app", "mode"] },
  ];

  function categoryOf(command: string): string {
    const prefix = command.split(".")[0];
    return CATEGORIES.find((c) => c.prefixes.includes(prefix))?.title ?? "Other";
  }

  const groups = $derived.by(() => {
    if (!open) return [];
    const items = keymap.shortcuts().flatMap((s) => {
      const command = editor.commands.get(s.command);
      if (!command) return [];
      return {
        command: s.command,
        category: categoryOf(s.command),
        // "Tool: Pixel brush" → "Pixel brush": the category already says it.
        title: command.title.replace(/^Tool: /, ""),
        keys: s.chords.map(formatChord),
      };
    });
    return [...CATEGORIES.map((c) => c.title), "Other"]
      .map((title) => ({ title, items: items.filter((i) => i.category === title) }))
      .filter((group) => group.items.length > 0);
  });

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!open) return;
    popupOpened();
    return () => popupClosed();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <!-- Closes on click (after the release), not on press: the press must not reach the
         canvas once the dialog is gone. -->
    <Dialog.Overlay class="dialog-overlay" onclick={() => (open = false)} />
    <Dialog.Content class="dialog panel shortcuts" interactOutsideBehavior="ignore">
      <Dialog.Title class="dialog-title">Keyboard shortcuts</Dialog.Title>
      <div class="columns">
        {#each groups as group (group.title)}
          <section>
            <h3>{group.title}</h3>
            <ul>
              {#each group.items as item (item.command)}
                <li>
                  <span class="name">{item.title}</span>
                  <span class="keys">
                    {#each item.keys as key (key)}<kbd>{key}</kbd>{/each}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
      <div class="actions">
        <Dialog.Close>Close</Dialog.Close>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.dialog.shortcuts) {
    width: min(760px * var(--ui-scale), 92vw);
    max-height: calc(90vh - var(--titlebar-height));
  }

  /* Two columns, filled one after the other; a category is never split. Room on the right
     for the scroll bar. */
  .columns {
    min-height: 0;
    padding-right: calc(var(--space) * 2);
    overflow-y: auto;
    columns: 2;
    column-gap: calc(var(--space) * 4);
  }

  section {
    break-inside: avoid;
    padding-bottom: calc(var(--space) * 2);
  }

  h3 {
    margin: 0 0 calc(var(--space) / 2);
    color: var(--text-muted);
    font-size: inherit;
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--space) * 2);
    min-height: calc(var(--control-height) - 2px);
  }

  .name {
    min-width: 0;
  }

  .keys {
    display: flex;
    flex: none;
    gap: calc(var(--space) / 2);
  }

  /* A small key cap per chord. */
  kbd {
    padding: 0 calc(var(--space) / 2);
    color: var(--text-muted);
    font: inherit;
    white-space: nowrap;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
