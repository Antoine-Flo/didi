<script lang="ts">
  // A dropdown menu drawn by the app (Bits UI), instead of the native one: it looks like the
  // rest of the interface, and avoids GTK popups (and their warnings) under Wayland.

  import { ChevronDown } from "@lucide/svelte";
  import { Select } from "bits-ui";
  import { popupClosed, popupOpened } from "$lib/app/dismissal";

  let {
    items,
    value,
    onchange,
    title,
  }: {
    items: { value: string; label: string }[];
    value: string;
    onchange: (value: string) => void;
    title?: string;
  } = $props();

  const label = $derived(items.find((i) => i.value === value)?.label ?? "");
</script>

<Select.Root
  type="single"
  {value}
  {items}
  onValueChange={(v) => v !== value && onchange(v)}
  onOpenChange={(open) => (open ? popupOpened() : popupClosed())}
>
  <Select.Trigger class="select-trigger" {title}>
    <span>{label}</span>
    <ChevronDown size={14} />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="select-content" sideOffset={4} collisionPadding={8}>
      <Select.Viewport class="select-viewport">
        {#each items as item (item.value)}
          <Select.Item class="select-item" value={item.value} label={item.label}>
            {item.label}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  :global(.select-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
    width: 100%;
    min-width: 0;
    background: var(--field);
    border: 1px solid var(--field-border);
    color: var(--text);
  }

  :global(.select-trigger span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.select-trigger svg) {
    flex: none;
    color: var(--text-muted);
  }

  :global(.select-content) {
    z-index: 60;
    box-sizing: border-box;
    min-width: var(--bits-select-anchor-width);
    max-height: min(var(--bits-select-content-available-height), 360px);
    padding: calc(var(--space) / 2);
    overflow-y: auto;
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  :global(.select-item) {
    display: flex;
    align-items: center;
    height: var(--control-height);
    padding: 0 var(--space);
    border-radius: var(--radius-small);
    white-space: nowrap;
    cursor: pointer;
  }

  :global(.select-item[data-highlighted]) {
    background: var(--hover);
  }

  :global(.select-item[data-selected]) {
    background: var(--selected);
  }
</style>
