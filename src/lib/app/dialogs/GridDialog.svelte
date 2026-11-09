<script lang="ts">
  // View → Grid settings…: the grids' settings (see GridSettings), also where the view's
  // column is not shown (compact). Changes show at once; Close keeps them.

  import type { ComponentProps } from "svelte";
  import { Dialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import GridSettings from "#lib/app/panels/GridSettings.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    open = $bindable(),
    side,
    ...settings
  }: ComponentProps<typeof GridSettings> & {
    open: boolean;
    /** Where it opens: the canvas's side, away from the panels. */
    side: "left" | "right";
  } = $props();

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
    <!-- No dimming: the canvas shows the grids. Same place as the size dialogs. -->
    <Dialog.Content class={["dialog panel size-dialog", side === "left" && "on-left"]}>
      <Dialog.Title class="dialog-title">{m.grid_title()}</Dialog.Title>
      <GridSettings {...settings} />
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
