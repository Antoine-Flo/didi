<script lang="ts">
  // The ⋮ menu of a panel (palettes, layers), drawn by the app (Bits UI). Its items are given
  // as children: `DropdownMenu.Item`s with the `menu-item` class.

  import { EllipsisVertical } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { onDestroy, type Snippet } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";

  let {
    title,
    disabled = false,
    onCloseAutoFocus,
    children,
  }: {
    title: string;
    disabled?: boolean;
    /** Called when the menu closes, before the focus goes back to its button. */
    onCloseAutoFocus?: (e: Event) => void;
    children: Snippet;
  } = $props();

  // While the menu is open, a click on the canvas only closes it.
  let open = false;
  function setOpen(next: boolean) {
    if (next === open) {
      return;
    }
    open = next;
    if (next) {
      popupOpened();
    } else {
      popupClosed();
    }
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setOpen(false));
</script>

<DropdownMenu.Root onOpenChange={setOpen}>
  <DropdownMenu.Trigger class="panel-menu-trigger" {title} {disabled}>
    <EllipsisVertical />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content"
      align="end"
      sideOffset={4}
      collisionPadding={8}
      {onCloseAutoFocus}
    >
      {@render children()}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.panel-menu-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  :global(.panel-menu-trigger[data-state="open"]) {
    background: var(--hover);
  }
</style>
