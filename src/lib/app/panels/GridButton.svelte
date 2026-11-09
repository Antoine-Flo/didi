<script lang="ts">
  // The grids' button of the status bar: lit while a grid is shown; a click opens the grids'
  // settings in a popup above it (see GridSettings).

  import type { ComponentProps } from "svelte";
  import { Popover } from "bits-ui";
  import { Grid3x3 } from "@lucide/svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import { popupPadding } from "#lib/app/widgets/popup-padding.js";
  import GridSettings from "#lib/app/panels/GridSettings.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let props: ComponentProps<typeof GridSettings> = $props();

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
    class={["icon", anyShown ? "active" : "off"]}
    title={m.grid_button_tip()}
    aria-label={m.grid_button_tip()}
  >
    <Grid3x3 />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="grid-popup" side="top" sideOffset={8} collisionPadding={popupPadding()}>
      <GridSettings {...props} />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.grid-popup) {
    z-index: 60;
    padding: var(--space);
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
</style>
