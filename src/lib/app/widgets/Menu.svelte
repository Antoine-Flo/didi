<script lang="ts">
  // A menu opened by an icon button, drawn by the app (Bits UI), like `Select`.

  import { DropdownMenu } from "bits-ui";
  import { onDestroy, type Component, type Snippet } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";

  let {
    items,
    onselect,
    title,
    children,
  }: {
    items: { id: string; label: string; icon?: Component<{ size?: number }>; active?: boolean }[];
    onselect: (id: string) => void;
    title?: string;
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
    <DropdownMenu.Content class="menu-content" side="bottom" sideOffset={4} collisionPadding={8}>
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

<style>
  :global(.menu-content) {
    z-index: 60;
    box-sizing: border-box;
    padding: calc(var(--space) / 2);
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  :global(.menu-item) {
    display: flex;
    align-items: center;
    gap: var(--space);
    height: var(--control-height);
    padding: 0 var(--space);
    border-radius: var(--radius-small);
    white-space: nowrap;
    cursor: pointer;
  }

  :global(.menu-item[data-highlighted]) {
    background: var(--hover);
  }

  :global(.menu-item[data-active]) {
    background: var(--selected);
  }
</style>
