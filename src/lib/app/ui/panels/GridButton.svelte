<script lang="ts">
  // The grids' button of the view's column: lit while a grid is shown; a click opens the
  // grids' settings in a popup beside it, towards the canvas (see GridSettings).

  import type { ComponentProps } from "svelte";
  import { Popover } from "bits-ui";
  import { Grid3x3 } from "@lucide/svelte";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import { popupPadding } from "#lib/app/shared/popup-padding.js";
  import GridSettings from "#lib/app/ui/panels/GridSettings.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    side,
    ...props
  }: ComponentProps<typeof GridSettings> & {
    /** Where the popup opens: towards the canvas. */
    side: "left" | "right";
  } = $props();

  let open = $state(false);
  $effect(() => {
    if (!open) {
      return;
    }
    popupOpened();
    return () => popupClosed();
  });

  const anyShown = $derived(props.pixelGrid || props.tileGrid.shown);
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class={["icon grid-button", anyShown ? "active" : "off"]}
    title={m.grid_button_tip()}
    aria-label={m.grid_button_tip()}
  >
    <Grid3x3 />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="grid-popup" {side} sideOffset={8} collisionPadding={popupPadding()}>
      <GridSettings {...props} />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  /* Off: like the layers' locks. */
  :global(.grid-button.off) {
    color: var(--text-faint);
  }

  :global(.grid-popup) {
    z-index: 60;
    padding: var(--space);
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
</style>
