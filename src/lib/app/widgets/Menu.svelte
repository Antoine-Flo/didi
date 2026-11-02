<script lang="ts">
  // A menu opened by an icon button, drawn by the app (Bits UI), like `Select`. Styles are
  // shared with the menu bar, in ui.css.

  import { DropdownMenu } from "bits-ui";
  import { onDestroy, type Component, type Snippet } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";

  let {
    items,
    onselect,
    title,
    side = "bottom",
    children,
  }: {
    items: { id: string; label: string; icon?: Component<{ size?: number }>; active?: boolean }[];
    onselect: (id: string) => void;
    title?: string;
    /** Where the menu opens, next to the button. */
    side?: "top" | "right" | "bottom" | "left";
    /** The content of the button. */
    children: Snippet;
  } = $props();

  let open = false;
  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    if (next) popupOpened();
    else popupClosed();
  }
  // Removed while open (e.g. its panel disappears): the canvas must not stay blocked.
  onDestroy(() => setOpen(false));
</script>

<DropdownMenu.Root onOpenChange={setOpen}>
  <DropdownMenu.Trigger class="icon" {title}>
    {@render children()}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="menu-content" {side} sideOffset={4} collisionPadding={8}>
      {#each items as item (item.id)}
        {@const Icon = item.icon}
        <DropdownMenu.Item
          class="menu-item"
          data-active={item.active ? "" : undefined}
          onSelect={() => onselect(item.id)}
        >
          {#if Icon}<Icon size={16} />{/if}
          {item.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
