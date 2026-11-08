<script lang="ts">
  // The list of keyboard shortcuts, by category, on two columns: each command and its keys,
  // those of the current mode included.

  import { Dialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import { formatChord, type KeymapIndex } from "#lib/app/commands/keymap.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    editor,
    keymap,
    open = $bindable(false),
  }: {
    editor: Editor;
    keymap: KeymapIndex;
    open?: boolean;
  } = $props();

  /** Categories in display order, with the command prefixes they hold; the last one holds
   *  the others. */
  const CATEGORIES: { id: string; title: () => string; prefixes: string[] }[] = [
    { id: "tools", title: m.shortcuts_tools, prefixes: ["tool", "brush"] },
    { id: "selection", title: m.shortcuts_selection, prefixes: ["selection"] },
    { id: "edit", title: m.shortcuts_edit, prefixes: ["history", "edit"] },
    { id: "view", title: m.shortcuts_view, prefixes: ["view"] },
    { id: "image", title: m.shortcuts_image, prefixes: ["image"] },
    { id: "layers", title: m.shortcuts_layers, prefixes: ["layer"] },
    { id: "file", title: m.shortcuts_file, prefixes: ["file", "app", "mode"] },
    { id: "other", title: m.shortcuts_other, prefixes: [] },
  ];

  function categoryOf(command: string): string {
    const prefix = command.split(".")[0];
    return CATEGORIES.find((c) => c.prefixes.includes(prefix))?.id ?? "other";
  }

  const groups = $derived.by(() => {
    if (!open) return [];
    const items = keymap.shortcuts().flatMap((s) => {
      const command = editor.commands.get(s.command);
      if (!command) return [];
      return {
        command: s.command,
        category: categoryOf(s.command),
        // "Pixel brush" rather than "Tool: Pixel brush": the category already says it.
        title: command.shortTitle ?? command.title,
        keys: s.chords.map(formatChord),
      };
    });
    return CATEGORIES.map((c) => ({
      id: c.id,
      title: c.title(),
      items: items.filter((i) => i.category === c.id),
    })).filter((group) => group.items.length > 0);
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
      <Dialog.Title class="dialog-title">{m.shortcuts_title()}</Dialog.Title>
      <div class="columns">
        {#each groups as group (group.id)}
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
        <Dialog.Close>{m.common_close()}</Dialog.Close>
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
