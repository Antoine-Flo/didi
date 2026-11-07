<script lang="ts">
  // Asks the name of an editable copy of a built-in palette, which cannot be changed.

  import { Dialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";

  let {
    source,
    oncopy,
    onclose,
  }: {
    /** Name of the palette to copy, or null: closed. */
    source: string | null;
    oncopy: (name: string) => void;
    onclose: () => void;
  } = $props();

  let name = $state("");
  $effect(() => {
    if (source !== null) name = `${source} copy`;
  });

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (source === null) return;
    popupOpened();
    return () => popupClosed();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    oncopy(name.trim());
    onclose();
  }
</script>

<Dialog.Root open={source !== null} onOpenChange={(open) => !open && onclose()}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog panel">
      <form onsubmit={submit}>
        <Dialog.Title class="dialog-title">Make an editable copy</Dialog.Title>
        <Dialog.Description class="dialog-text">
          Built-in palettes can't be changed. Give your copy a name, then edit it as you like.
        </Dialog.Description>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          bind:value={name}
          aria-label="Name of the copy"
          autofocus
          onfocus={(e) => e.currentTarget.select()}
        />
        <div class="actions">
          <span class="spacer"></span>
          <button type="button" onclick={onclose}>Cancel</button>
          <button type="submit" class="primary" disabled={!name.trim()}>Create copy</button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }

  .actions {
    display: flex;
    gap: var(--space);
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
