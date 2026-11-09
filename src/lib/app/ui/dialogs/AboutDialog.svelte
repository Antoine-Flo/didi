<script lang="ts">
  // About Didi: its version, what it is, and what it is made with.

  import { Dialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import { m } from "#lib/paraglide/messages.js";

  let { open = $bindable(false) }: { open: boolean } = $props();

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!open) {
      return;
    }
    popupOpened();
    return () => popupClosed();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" onclick={() => (open = false)} />
    <Dialog.Content class="dialog panel">
      <Dialog.Title class="dialog-title">{m.about_title()}</Dialog.Title>
      <p class="dialog-text">{m.about_version({ version: __APP_VERSION__ })}</p>
      <p class="dialog-text">{m.about_description()}</p>
      <p class="dialog-text">{m.about_brushes()}</p>
      <div class="actions">
        <span class="spacer"></span>
        <button class="primary" onclick={() => (open = false)}>{m.common_close()}</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .actions {
    display: flex;
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
