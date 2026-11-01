<script lang="ts">
  // Asks what to do with unsaved changes, before they would be lost.

  import { AlertDialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { UnsavedChoice } from "#lib/app/files/session.svelte.js";

  let {
    request,
  }: {
    /** The pending question, or null. `answer` is called once with the choice. */
    request: { name: string; answer: (choice: UnsavedChoice) => void } | null;
  } = $props();

  function answer(choice: UnsavedChoice) {
    request?.answer(choice);
  }

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!request) return;
    popupOpened();
    return () => popupClosed();
  });
</script>

<AlertDialog.Root
  open={request !== null}
  onOpenChange={(open) => {
    // Closed with Escape: the safe answer. (After a button, the answer is already given.)
    if (!open) answer("cancel");
  }}
>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="dialog-overlay" />
    <AlertDialog.Content class="dialog panel">
      <AlertDialog.Title class="dialog-title">
        Save changes to “{request?.name}”?
      </AlertDialog.Title>
      <AlertDialog.Description class="dialog-text">
        Your changes will be lost if you don't save them.
      </AlertDialog.Description>
      <div class="dialog-actions">
        <button onclick={() => answer("discard")}>Don't save</button>
        <span class="spacer"></span>
        <AlertDialog.Cancel onclick={() => answer("cancel")}>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action class="primary" onclick={() => answer("save")}>Save</AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  /* Below the title bar, which stays usable. */
  :global(.dialog-overlay) {
    position: fixed;
    inset: var(--titlebar-height) 0 0;
    z-index: 50;
    background: var(--overlay);
  }

  /* Centered below the title bar by the layout, not by a transform: a translation of half
     a pixel blurs the text. */
  :global(.dialog) {
    position: fixed;
    inset: var(--titlebar-height) 0 0;
    z-index: 51;
    display: flex;
    flex-direction: column;
    gap: var(--space);
    width: min(400px, 90vw);
    height: fit-content;
    margin: auto;
    padding: calc(var(--space) * 2);
    background: var(--popup);
  }

  :global(.dialog-title) {
    margin: 0;
    font-size: inherit;
    font-weight: 600;
  }

  :global(.dialog-text) {
    margin: 0;
    color: var(--text-muted);
  }

  .dialog-actions {
    display: flex;
    gap: var(--space);
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
