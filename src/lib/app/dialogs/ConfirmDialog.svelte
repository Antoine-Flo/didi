<script lang="ts">
  // Asks to confirm an action that cannot be undone, e.g. deleting a palette.

  import { AlertDialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";

  let {
    request,
    onclose,
  }: {
    /** The pending question, or null: closed. */
    request: { title: string; text: string; action: string; onconfirm: () => void } | null;
    onclose: () => void;
  } = $props();

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!request) return;
    popupOpened();
    return () => popupClosed();
  });
</script>

<AlertDialog.Root open={request !== null} onOpenChange={(open) => !open && onclose()}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="dialog-overlay" />
    <AlertDialog.Content class="dialog panel">
      <AlertDialog.Title class="dialog-title">{request?.title}</AlertDialog.Title>
      <AlertDialog.Description class="dialog-text">{request?.text}</AlertDialog.Description>
      <div class="actions">
        <span class="spacer"></span>
        <AlertDialog.Cancel onclick={onclose}>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action
          class="primary"
          onclick={() => {
            request?.onconfirm();
            onclose();
          }}
        >
          {request?.action}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .actions {
    display: flex;
    gap: var(--space);
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
